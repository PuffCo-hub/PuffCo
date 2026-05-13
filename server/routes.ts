import type { Express } from "express";
import type { Server } from "node:http";
import { storage, DEFAULT_PRICING, DEFAULT_ORDER_SETTINGS, DEFAULT_NOTIFICATIONS, DEFAULT_COMPLIANCE, FLAT_DELIVERY_FEE_CENTS } from "./storage";
import {
  insertOrderSchema,
  insertProductRequestSchema,
  productInputSchema,
  PAYMENT_STATUSES,
  type PricingSettings,
  type OrderSettings,
  type NotificationSettings,
  type ComplianceSettings,
  type OrderItem,
} from "@shared/schema";
import { computePricing } from "./pricing";

// Computes the per-order economic snapshot. Frozen onto the order so later
// changes to a shop's puffGoDiscountPercent or the global markupPercent never
// alter historical orders.
//
// Inputs are the validated items, the customer-facing subtotal (already
// marked-up by the client cart), the resolved shop, and the active pricing
// settings. Returns the breakdown we expose to admin and store on the row.
//
// Formula (default 10% shop discount, 20% PuffGo markup, $2.50 delivery):
//   itemsBaseCents      = sum(item.basePriceCents * qty)               // list price
//   shopPayoutCents     = itemsBaseCents * (1 - shopDiscount%/100)     // shop gets
//   customerItemsCents  = order.subtotal (= itemsBase * (1 + markup%))  // customer items
//   puffGoMarkupCents   = customerItemsCents - itemsBaseCents          // markup share
//   deliveryFeeCents    = pricing.serviceFeeFlatCents                  // flat $2.50
//   puffGoProfitCents   = customerItemsCents - shopPayoutCents + deliveryFeeCents
//   customerTotalCents  = customerItemsCents + tipCents + deliveryFeeCents
// Tip is intentionally excluded from PuffGo profit — passes through to driver.
function computeOrderEconomics(args: {
  items: { basePriceCents: number; qty: number }[];
  customerSubtotalCents: number;
  shopDiscountPercent: number;
  deliveryFeeCents: number;
}) {
  const discount = Math.max(0, Math.min(100, args.shopDiscountPercent));
  const itemsBaseCents = args.items.reduce(
    (sum, it) =>
      sum + Math.max(0, Math.round(it.basePriceCents)) * Math.max(0, Math.round(it.qty)),
    0,
  );
  const shopPayoutCents = Math.round(itemsBaseCents * (1 - discount / 100));
  const customerItemsCents = Math.max(0, Math.round(args.customerSubtotalCents));
  const puffGoMarkupCents = Math.max(0, customerItemsCents - itemsBaseCents);
  const deliveryFeeCents = Math.max(0, Math.round(args.deliveryFeeCents));
  const puffGoProfitCents = customerItemsCents - shopPayoutCents + deliveryFeeCents;
  return {
    itemsBaseCents,
    shopPayoutCents,
    puffGoMarkupCents,
    deliveryFeeCents,
    puffGoProfitCents,
  };
}
import { findSubstitutes } from "./substitutions";
import {
  notify,
  sendSms,
  isSmsConfigured,
  resolveDriverRecipients,
} from "./notifications";
import { startSweeper, runOnce } from "./sweeper";
import { z } from "zod";

// Phone number must allow common formatting (spaces, dashes, parentheses, dots,
// leading +) but contain at least 7 digits.
const PHONE_RE = /^[+\d\s().\-]+$/;
function countDigits(value: string): number {
  return (value.match(/\d/g) || []).length;
}

function defaultWaitMinutes(): number {
  const raw = Number(process.env.AVERAGE_WAIT_MINUTES);
  if (Number.isFinite(raw) && raw > 0) return Math.round(raw);
  return 45;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const ADMIN_PIN = process.env.PUFFCO_ADMIN_PIN || "PuffCo2026";

function requireAdmin(req: any, res: any) {
  const pin = String(req.headers["x-admin-pin"] || "");
  if (pin !== ADMIN_PIN) {
    res.status(401).json({ error: "admin pin required" });
    return false;
  }
  return true;
}

// Resolve a shop from the X-Shop-Pin header. Returns the shop if valid &
// active, otherwise sends a 401 and returns null. Pattern mirrors
// requireAdmin so future role-auth can swap the header lookup for a real
// session without touching individual route handlers.
async function requireShop(req: any, res: any) {
  const pin = String(req.headers["x-shop-pin"] || "").trim();
  if (!pin) {
    res.status(401).json({ error: "shop access code required" });
    return null;
  }
  const shop = await storage.getShopByPin(pin);
  if (!shop || !shop.active) {
    res.status(401).json({ error: "invalid shop access code" });
    return null;
  }
  return shop;
}

async function requireDriver(req: any, res: any) {
  const pin = String(req.headers["x-driver-pin"] || "").trim();
  if (!pin) {
    res.status(401).json({ error: "driver access code required" });
    return null;
  }
  const driver = await storage.getDriverByPin(pin);
  if (!driver || !driver.active) {
    res.status(401).json({ error: "invalid driver access code" });
    return null;
  }
  return driver;
}

// Strip customer/platform/financial fields. The shop sees only what it needs
// to prep the order and its own payout. PuffGo markup, customer total, fee
// breakdown, tip, and driver economics are all omitted so the shop never sees
// PuffGo's profit on the order.
function shopOrderView(o: any, shop: any) {
  let items: any[] = [];
  try { items = JSON.parse(o.items || "[]"); } catch { items = []; }
  // Prefer the snapshot stored on the order. Falls back to recomputing from
  // the current shop discount for historical orders that pre-date the snapshot
  // columns (those rows have shopPayoutCents = 0).
  const fallbackDiscount = Math.max(
    0,
    Math.min(100, Number(shop?.puffGoDiscountPercent ?? 10)),
  );
  let payoutCents = Number(o.shopPayoutCents ?? 0);
  if (!payoutCents) {
    const itemsBase = items.reduce(
      (sum: number, it: any) =>
        sum + (Number(it.basePriceCents) || 0) * (Number(it.qty) || 0),
      0,
    );
    payoutCents = Math.round(itemsBase * (1 - fallbackDiscount / 100));
  }
  return {
    id: o.id,
    orderCode: o.orderCode,
    createdAt: o.createdAt,
    // Customer name (first + last initial) is included so the shop can confirm
    // pickup identity. No phone, address, or platform economics.
    customerName: [o.customerFirstName, o.customerLastInitial]
      .filter(Boolean)
      .join(" ")
      .trim(),
    items: items.map((it) => ({
      id: it.id,
      name: it.name,
      brand: it.brand,
      qty: it.qty,
    })),
    notes: o.notes || "",
    shopStatus: o.shopStatus || "new",
    driverStatus: o.driverStatus || "unclaimed",
    paymentStatus: o.paymentStatus,
    shopPayoutCents: payoutCents,
  };
}

// Strip platform/customer-economics fields for the driver view. Driver sees
// pickup shop, drop-off address, items needed to verify handoff, and only
// driver-relevant status fields.
function driverOrderView(o: any, shop: any) {
  let items: any[] = [];
  try { items = JSON.parse(o.items || "[]"); } catch { items = []; }
  return {
    id: o.id,
    orderCode: o.orderCode,
    createdAt: o.createdAt,
    items: items.map((it) => ({
      id: it.id,
      name: it.name,
      brand: it.brand,
      qty: it.qty,
    })),
    pickup: {
      shopName: shop?.name || "Pickup location",
      address: shop?.address || "",
      phone: shop?.contactPhone || "",
    },
    dropoff: {
      firstName: o.customerFirstName,
      lastInitial: o.customerLastInitial,
      phone: o.customerPhone,
      street: o.street,
      unit: o.unit,
      city: o.city,
      state: o.state,
      zip: o.zip,
    },
    notes: o.notes || "",
    shopStatus: o.shopStatus || "new",
    driverStatus: o.driverStatus || "unclaimed",
    paymentStatus: o.paymentStatus,
  };
}

// Public-safe view of a product. Strips internal vendor/location and never
// exposes any supplier-cost data (the schema doesn't carry it, but this keeps
// the surface area explicit). Also computes a derived `available` boolean.
// Normalise a stored image URL into something that loads correctly both
// locally (where the static dev server serves /products/foo.jpg) and once
// deployed (where the bundle is hosted under a sub-path so absolute paths
// like "/products/..." 404). Data URIs and http(s) URLs are returned as-is
// so admin-pasted external links keep working.
function normalizeImageUrl(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (v.startsWith("data:")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  // Strip any leading slashes so the browser treats it as relative to the
  // current page. /products/foo.jpg -> products/foo.jpg, ./products/foo.jpg ->
  // products/foo.jpg.
  return v.replace(/^\.?\/+/, "");
}

function publicProduct(p: any) {
  let substituteIds: string[] = [];
  try {
    substituteIds = JSON.parse(p.substituteIds || "[]");
  } catch {
    substituteIds = [];
  }
  return {
    id: p.id,
    name: p.name,
    orderName: p.orderName,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    basePriceCents: p.basePriceCents,
    blurb: p.blurb,
    detail: p.detail,
    imageUrl: normalizeImageUrl(p.imageUrl),
    imageKind: p.imageKind,
    accent: p.accent,
    active: p.active,
    popular: p.popular,
    stockCount: p.stockCount,
    lowStockThreshold: p.lowStockThreshold,
    available: !!p.active && (p.stockCount ?? 0) > 0,
    lowStock: (p.stockCount ?? 0) > 0 && (p.stockCount ?? 0) <= (p.lowStockThreshold ?? 0),
    substituteIds,
    vendorId: p.vendorId,
    locationId: p.locationId,
    shopId: p.shopId || "default",
  };
}

function publicShop(s: any) {
  // Surface storeCode/storeHours to customers — they help shoppers identify
  // and plan around a shop's pickup window. Internal-only fields (pin, payout,
  // pickup address, contact phone) and the now-deprecated per-shop fees are
  // intentionally omitted. Per-shop service/delivery fees are kept on the
  // record for backward compatibility but no longer affect the order total —
  // a single global flat delivery fee is applied at checkout instead.
  return {
    id: s.id,
    name: s.name,
    blurb: s.blurb,
    serviceArea: s.serviceArea,
    active: !!s.active,
    open: !!s.open,
    imageUrl: s.imageUrl,
    accent: s.accent,
    storeCode: s.storeCode || "",
    storeHours: s.storeHours || "",
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Kick off background timeout sweeper (process-wide, idempotent).
  startSweeper();

  // Lightweight health/readiness endpoint. No auth, no DB writes — used by
  // Render's health check path (set this to /health in the Render dashboard)
  // and by simple uptime pingers that keep the free-tier instance warm.
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      status: "ready",
      version: process.env.npm_package_version || "1.0.0",
      time: new Date().toISOString(),
    });
  });

  // ----------- Orders -----------
  app.get("/api/orders", async (_req, res) => {
    const all = await storage.listOrders();
    res.json(all);
  });

  app.get("/api/orders/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
    const order = await storage.getOrder(id);
    if (!order) return res.status(404).json({ error: "not found" });
    res.json(order);
  });

  app.post("/api/orders", async (req, res) => {
    const parsed = insertOrderSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    // Customer contact validation. The base insert schema is permissive for
    // backwards compatibility with already-stored rows; new orders must
    // supply a real first name, last initial, and phone with >= 7 digits.
    const firstName = String(parsed.data.customerFirstName ?? "").trim();
    const lastInitial = String(parsed.data.customerLastInitial ?? "").trim();
    const phone = String(parsed.data.customerPhone ?? "").trim();
    const fieldErrors: Record<string, string> = {};
    if (firstName.length < 1) fieldErrors.customerFirstName = "First name required";
    if (lastInitial.length < 1)
      fieldErrors.customerLastInitial = "Last initial required";
    if (!phone) {
      fieldErrors.customerPhone = "Phone required";
    } else if (!PHONE_RE.test(phone) || countDigits(phone) < 7) {
      fieldErrors.customerPhone = "Enter a valid phone (at least 7 digits)";
    }
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ error: { fieldErrors } });
    }

    // Validate stock for every line and apply atomic decrement. If any line is
    // out of stock, return the offending IDs so the client can offer
    // substitutes before checkout.
    let items: OrderItem[] = [];
    try {
      items = JSON.parse(parsed.data.items);
    } catch {
      return res.status(400).json({ error: "items must be JSON array" });
    }

    const unavailable: string[] = [];
    for (const it of items) {
      const p = await storage.getProduct(it.id);
      if (!p || !p.active || p.stockCount < it.qty) {
        unavailable.push(it.id);
      }
    }
    if (unavailable.length > 0) {
      return res.status(409).json({ error: "items unavailable", unavailable });
    }

    // Apply server-side pricing settings and decrement stock.
    const pricing =
      (await storage.getSetting<PricingSettings>("pricing")) || DEFAULT_PRICING;
    const breakdown = computePricing(parsed.data.subtotal, parsed.data.tipCents, pricing);

    // Flat delivery fee applies to every order regardless of shop. Per-shop
    // service/delivery fees are no longer honoured — we keep the columns for
    // backward compatibility but treat them as zero so admins don't need to
    // manage them.
    const finalFeeCents = breakdown.feeCents;
    const finalTotalCents = breakdown.totalCents;

    // Snapshot the economics at order time so later admin tweaks to a shop's
    // PuffGo discount % or the global markup % don't rewrite history.
    const shop = await storage.getShop(parsed.data.shopId || "default");
    const shopDiscountPercent = Math.max(
      0,
      Math.min(100, Number(shop?.puffGoDiscountPercent ?? 10)),
    );
    const econ = computeOrderEconomics({
      items: items.map((it) => ({
        basePriceCents: it.basePriceCents,
        qty: it.qty,
      })),
      customerSubtotalCents: parsed.data.subtotal,
      shopDiscountPercent,
      deliveryFeeCents: finalFeeCents,
    });

    for (const it of items) {
      await storage.adjustStock(it.id, -it.qty);
    }

    const order = await storage.createOrder(parsed.data, {
      feeCents: finalFeeCents,
      totalCents: finalTotalCents,
      shopPayoutCents: econ.shopPayoutCents,
      puffGoMarkupCents: econ.puffGoMarkupCents,
      deliveryFeeCents: econ.deliveryFeeCents,
      puffGoProfitCents: econ.puffGoProfitCents,
    });

    await storage.appendAudit("order.created", String(order.id), {
      total: order.totalCents,
      itemCount: items.length,
      vendorId: order.vendorId,
      locationId: order.locationId,
    });

    // Best-effort notification (webhook + log) plus SMS fanout. Never blocks
    // the response. SMS fanout is wrapped in its own try/catch and audited.
    const notifSettings = (await storage
      .getSetting<NotificationSettings>("notifications")
      .catch(() => undefined)) || DEFAULT_NOTIFICATIONS;
    notify(
      {
        title: `New order ${order.orderCode || "#" + order.id}`,
        body: `Total $${(order.totalCents / 100).toFixed(2)} — watch Cash App note for ${order.orderCode || "#" + order.id}.`,
        tag: "order.new",
        subjectId: String(order.id),
      },
      notifSettings,
    ).catch(() => {});

    void dispatchOrderSms(order, items, notifSettings).catch((err) => {
      console.warn("[sms] dispatch failed:", err?.message || err);
    });

    res.json(order);
  });

  async function dispatchOrderSms(
    order: any,
    items: OrderItem[],
    notif: NotificationSettings,
  ) {
    if (!isSmsConfigured()) {
      await storage.appendAudit("sms.skipped", String(order.id), {
        reason: "twilio env vars missing",
      });
      return;
    }

    const customerName = `${order.customerFirstName} ${order.customerLastInitial}`.trim();
    const orderCode = order.orderCode || `#${order.id}`;
    const itemsLine = items
      .map((it) => `${it.qty}x ${it.brand ? `${it.brand} ` : ""}${it.name}`)
      .join("; ");
    const fullAddress = [
      order.street,
      order.unit ? `Unit ${order.unit}` : "",
      `${order.city}, ${order.state} ${order.zip}`,
    ]
      .filter(Boolean)
      .join(", ");

    // Driver/operator alert — multi-recipient.
    const recipients = resolveDriverRecipients(notif.operatorPhone);
    const driverBody =
      `New PuffGo order ${orderCode}\n` +
      `Customer: ${customerName} (${order.customerPhone})\n` +
      `Items: ${itemsLine}\n` +
      `Deliver to: ${fullAddress}`;
    for (const to of recipients) {
      const result = await sendSms(to, driverBody);
      await storage.appendAudit("sms.driver_alert", String(order.id), {
        to,
        ok: result.ok,
        skipped: result.skipped ?? false,
        error: result.error,
        reason: result.reason,
      });
    }

    // Customer confirmation.
    const wait = defaultWaitMinutes();
    const customerBody =
      `Thanks ${order.customerFirstName} — PuffGo received your order ${orderCode}. ` +
      `Typical wait is about ${wait} minutes. ` +
      `We'll confirm once payment is matched. Reply if anything needs to change.`;
    const confirmation = await sendSms(order.customerPhone, customerBody);
    await storage.appendAudit("sms.customer_confirmation", String(order.id), {
      to: order.customerPhone,
      ok: confirmation.ok,
      skipped: confirmation.skipped ?? false,
      error: confirmation.error,
      reason: confirmation.reason,
      waitMinutes: wait,
    });
  }

  app.post("/api/orders/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "");
    const allowed = [
      "placed",
      "pay_pending",
      "confirmed",
      "en_route",
      "delivered",
      "canceled",
      "attention_needed",
    ];
    if (!allowed.includes(status))
      return res.status(400).json({ error: "bad status" });
    const before = await storage.getOrder(id);
    const order = await storage.updateOrderStatus(id, status);
    if (!order) return res.status(404).json({ error: "not found" });

    // If the operator cancels an unfulfilled order, restore the stock so the
    // catalog doesn't permanently leak inventory.
    if (status === "canceled" && before && !["delivered", "canceled"].includes(before.status)) {
      try {
        const items: OrderItem[] = JSON.parse(before.items);
        for (const it of items) {
          await storage.adjustStock(it.id, it.qty);
        }
      } catch {
        // ignore parse errors
      }
      // Mirror cancel into payment status when the order hadn't been paid yet,
      // so it never sits in "pending payment value" forever.
      if (before.paymentStatus === "pending_payment") {
        await storage.updateOrderPaymentStatus(id, "canceled");
      } else if (before.paymentStatus === "paid") {
        // If the operator cancels something already paid, flag it for refund.
        await storage.updateOrderPaymentStatus(id, "refund_due");
      }
    }

    await storage.appendAudit("order.status_changed", String(id), {
      from: before?.status,
      to: status,
    });
    res.json(order);
  });

  app.post("/api/orders/:id/cashtag-sent", async (req, res) => {
    const id = Number(req.params.id);
    const order = await storage.markCashtagSent(id);
    if (!order) return res.status(404).json({ error: "not found" });
    await storage.appendAudit("order.cashtag_sent", String(id), {});
    res.json(order);
  });

  // Admin payment-status transitions: pending_payment | paid | refund_due |
  // refunded | canceled. Separate endpoint from order status so revenue and
  // fulfillment can move independently.
  app.post("/api/orders/:id/payment-status", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    const next = String(req.body?.paymentStatus || "");
    if (!PAYMENT_STATUSES.includes(next as any)) {
      return res.status(400).json({ error: "bad payment status" });
    }
    const before = await storage.getOrder(id);
    if (!before) return res.status(404).json({ error: "not found" });
    const order = await storage.updateOrderPaymentStatus(id, next);
    await storage.appendAudit("order.payment_status_changed", String(id), {
      from: before.paymentStatus,
      to: next,
    });
    // Convenience: when admin marks paid for the first time and the order is
    // still in the early lifecycle, advance fulfillment to confirmed so the
    // driver pickup queue lights up automatically.
    if (next === "paid" && ["placed", "pay_pending"].includes(before.status)) {
      await storage.updateOrderStatus(id, "confirmed");
      await storage.appendAudit("order.status_changed", String(id), {
        from: before.status,
        to: "confirmed",
        reason: "payment_marked_paid",
      });
    }
    res.json(order);
  });

  // Lookup by short order code (PG01, PG02, etc.). Useful for admin search and for the
  // customer-facing confirmation flow if they ever lose the in-memory order id.
  app.get("/api/orders/by-code/:code", async (req, res) => {
    const code = String(req.params.code || "").toUpperCase().trim();
    const order = await storage.getOrderByCode(code);
    if (!order) return res.status(404).json({ error: "not found" });
    res.json(order);
  });

  app.post("/api/orders/:id/acknowledge", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    const order = await storage.acknowledgeOrder(id);
    if (!order) return res.status(404).json({ error: "not found" });
    await storage.appendAudit("order.acknowledged", String(id), {});
    res.json(order);
  });

  // Manually trigger the timeout sweep (handy for ops & tests).
  app.post("/api/orders/sweep", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await runOnce();
    res.json({ ok: true });
  });

  // ----------- Product requests -----------
  app.get("/api/requests", async (_req, res) => {
    const all = await storage.listProductRequests();
    res.json(all);
  });

  app.post("/api/requests", async (req, res) => {
    const parsed = insertProductRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const r = await storage.createProductRequest(parsed.data);
    res.json(r);
  });

  // ----------- Products -----------
  app.get("/api/products", async (req, res) => {
    const includeInactive = req.query.all === "true";
    const shopId = typeof req.query.shopId === "string" && req.query.shopId
      ? String(req.query.shopId)
      : undefined;
    const all = await storage.listProducts(includeInactive, shopId ? { shopId } : undefined);
    res.json(all.map(publicProduct));
  });

  // ----------- Shops -----------
  // Public — returns active shops only with safe fields.
  app.get("/api/shops", async (_req, res) => {
    const all = await storage.listShops(false);
    res.json(all.map(publicShop));
  });
  app.get("/api/shops/:id", async (req, res) => {
    const s = await storage.getShop(req.params.id);
    if (!s || !s.active) return res.status(404).json({ error: "not found" });
    res.json(publicShop(s));
  });
  // Admin shop CRUD.
  app.get("/api/admin/shops", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await storage.listShops(true));
  });
  app.post("/api/admin/shops", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      id: z.string().min(1).optional(),
      name: z.string().min(1),
      blurb: z.string().max(500).optional(),
      serviceArea: z.string().max(200).optional(),
      notes: z.string().max(1000).optional(),
      active: z.boolean().optional(),
      open: z.boolean().optional(),
      imageUrl: z.string().max(2048).optional(),
      accent: z.string().max(32).optional(),
      pin: z.string().min(3).max(64).optional(),
      contactPhone: z.string().max(64).optional(),
      address: z.string().max(300).optional(),
      // Replaces legacy payoutPercent in the admin UI. 8–12 is typical.
      puffGoDiscountPercent: z.number().int().min(0).max(100).optional(),
      loyaltyProgram: z.string().max(1000).optional(),
      storeHours: z.string().max(300).optional(),
      // storeCode is intentionally NOT accepted from clients — the server
      // always auto-generates the next P-number to keep the sequence
      // deterministic. Pass-through requests with storeCode are ignored.
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const id = parsed.data.id || slugify(parsed.data.name) || `shop-${Date.now().toString(36)}`;
    const exists = await storage.getShop(id);
    if (exists) return res.status(409).json({ error: "shop id already exists" });
    const pin = parsed.data.pin && parsed.data.pin.length > 0
      ? parsed.data.pin
      : `shop-${Math.random().toString(36).slice(2, 6)}`;
    const s = await storage.createShop({ ...parsed.data, id, pin } as any);
    await storage.appendAudit("shop.created", id, { name: s.name, storeCode: s.storeCode });
    res.json(s);
  });
  app.patch("/api/admin/shops/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      name: z.string().min(1).optional(),
      blurb: z.string().max(500).optional(),
      serviceArea: z.string().max(200).optional(),
      notes: z.string().max(1000).optional(),
      active: z.boolean().optional(),
      open: z.boolean().optional(),
      imageUrl: z.string().max(2048).optional(),
      accent: z.string().max(32).optional(),
      pin: z.string().min(3).max(64).optional(),
      contactPhone: z.string().max(64).optional(),
      address: z.string().max(300).optional(),
      puffGoDiscountPercent: z.number().int().min(0).max(100).optional(),
      loyaltyProgram: z.string().max(1000).optional(),
      storeHours: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const before = await storage.getShop(req.params.id);
    if (!before) return res.status(404).json({ error: "not found" });
    const updated = await storage.updateShop(req.params.id, parsed.data as any);
    await storage.appendAudit("shop.updated", req.params.id, {
      keys: Object.keys(parsed.data),
    });
    res.json(updated);
  });

  app.post("/api/products", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = {
      ...req.body,
      id:
        req.body?.id ||
        `${slugify(`${req.body?.brand || ""}-${req.body?.orderName || req.body?.name || "product"}`)}-${Date.now().toString(36)}`,
    };
    // Normalize substituteIds: accept arrays or JSON strings.
    if (Array.isArray(body.substituteIds)) {
      body.substituteIds = JSON.stringify(body.substituteIds);
    }
    const parsed = productInputSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const id = parsed.data.id || body.id;
    const exists = await storage.getProduct(id);
    if (exists) return res.status(409).json({ error: "product id already exists" });
    const product = await storage.createProduct(parsed.data as any);
    await storage.appendAudit("product.created", id, {
      name: product.name,
      stockCount: product.stockCount,
    });
    res.json(publicProduct(product));
  });

  app.patch("/api/products/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const current = await storage.getProduct(req.params.id);
    if (!current) return res.status(404).json({ error: "not found" });
    const incoming = { ...req.body };
    if (Array.isArray(incoming.substituteIds)) {
      incoming.substituteIds = JSON.stringify(incoming.substituteIds);
    }
    const merged = { ...current, ...incoming, id: current.id };
    const parsed = productInputSchema.safeParse(merged);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const product = await storage.updateProduct(req.params.id, parsed.data as any);
    if (product && product.stockCount !== current.stockCount) {
      await storage.appendAudit("product.stock_changed", current.id, {
        from: current.stockCount,
        to: product.stockCount,
      });
    }
    await storage.appendAudit("product.updated", current.id, {});
    res.json(product ? publicProduct(product) : null);
  });

  app.post("/api/products/:id/stock", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      delta: z.number().int().optional(),
      set: z.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const before = await storage.getProduct(req.params.id);
    if (!before) return res.status(404).json({ error: "not found" });
    let after = before;
    if (typeof parsed.data.set === "number") {
      after = (await storage.setStock(req.params.id, parsed.data.set))!;
    } else if (typeof parsed.data.delta === "number") {
      after = (await storage.adjustStock(req.params.id, parsed.data.delta))!;
    }
    await storage.appendAudit("product.stock_changed", req.params.id, {
      from: before.stockCount,
      to: after.stockCount,
    });
    res.json(publicProduct(after));
  });

  app.delete("/api/products/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const ok = await storage.deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    await storage.appendAudit("product.deleted", req.params.id, {});
    res.json({ ok: true });
  });

  // ----------- Substitutions -----------
  // Public — used by the cart/checkout flow when an item is unavailable.
  app.post("/api/substitutes", async (req, res) => {
    const schema = z.object({
      productId: z.string(),
      priceDeltaThresholdCents: z.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const target = await storage.getProduct(parsed.data.productId);
    if (!target) return res.status(404).json({ error: "not found" });
    const all = await storage.listProducts(false);
    const settings =
      (await storage.getSetting<{ priceDeltaThresholdCents: number }>("substitution")) ||
      { priceDeltaThresholdCents: 1500 };
    const threshold =
      parsed.data.priceDeltaThresholdCents ?? settings.priceDeltaThresholdCents ?? 1500;
    const matches = findSubstitutes(target as any, all as any, threshold);
    res.json({
      target: publicProduct(target),
      threshold,
      suggestions: matches.map((m) => ({
        ...publicProduct(m.product),
        reason: m.reason,
        priceDeltaCents: m.priceDeltaCents,
      })),
    });
  });

  // ----------- Settings -----------
  app.get("/api/settings", async (_req, res) => {
    const s = await storage.listSettings();
    // Compose a public-safe view: pricing.markupPercent is shown so the client
    // can compute display prices, but the rest of pricing is admin-only.
    const pricing = (s.pricing as PricingSettings) || DEFAULT_PRICING;
    res.json({
      pricing: { markupPercent: pricing.markupPercent },
      compliance: (s.compliance as ComplianceSettings) || DEFAULT_COMPLIANCE,
    });
  });

  app.get("/api/admin/settings", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const s = await storage.listSettings();
    res.json({
      pricing: (s.pricing as PricingSettings) || DEFAULT_PRICING,
      orderRules: (s.orderRules as OrderSettings) || DEFAULT_ORDER_SETTINGS,
      notifications: (s.notifications as NotificationSettings) || DEFAULT_NOTIFICATIONS,
      compliance: (s.compliance as ComplianceSettings) || DEFAULT_COMPLIANCE,
      substitution: (s.substitution as { priceDeltaThresholdCents: number }) || {
        priceDeltaThresholdCents: 1500,
      },
    });
  });

  app.patch("/api/admin/settings", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      pricing: z
        .object({
          mode: z.enum(["service_fee", "revenue_split"]),
          serviceFeeFlatCents: z.number().int().min(0),
          serviceFeePercent: z.number().min(0).max(100),
          revenueSplitPercent: z.number().min(0).max(100),
          markupPercent: z.number().min(0).max(100),
        })
        .partial()
        .optional(),
      orderRules: z
        .object({
          ackTimeoutMinutes: z.number().int().min(0).max(720),
          ackTimeoutAction: z.enum(["flag", "cancel"]),
        })
        .partial()
        .optional(),
      notifications: z
        .object({
          operatorPhone: z.string().max(64),
          webhookUrl: z.string().max(512),
          soundEnabled: z.boolean(),
        })
        .partial()
        .optional(),
      compliance: z
        .object({
          ageGateText: z.string().max(500),
          idVerifyText: z.string().max(500),
          legalDisclaimer: z.string().max(2000),
        })
        .partial()
        .optional(),
      substitution: z
        .object({
          priceDeltaThresholdCents: z.number().int().min(0),
        })
        .partial()
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
      const incoming = parsed.data[key];
      if (!incoming) continue;
      const existing = (await storage.getSetting<Record<string, unknown>>(key)) || {};
      const merged = { ...existing, ...incoming };
      await storage.setSetting(key, merged);
      await storage.appendAudit("settings.updated", String(key), {
        keys: Object.keys(incoming),
      });
    }
    const s = await storage.listSettings();
    res.json(s);
  });

  // ----------- Revenue summary -----------
  // Splits out what is actually paid versus pending so the admin dashboard
  // never overstates revenue. Excludes canceled orders entirely.
  app.get("/api/admin/revenue", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const all = await storage.listOrders();
    let paidCents = 0;
    let pendingCents = 0;
    let deliveredCents = 0;
    let refundedCents = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let deliveredCount = 0;
    for (const o of all) {
      if (o.paymentStatus === "canceled") continue;
      if (o.paymentStatus === "paid") {
        paidCents += o.totalCents;
        paidCount += 1;
        if (o.status === "delivered") {
          deliveredCents += o.totalCents;
          deliveredCount += 1;
        }
      } else if (o.paymentStatus === "pending_payment") {
        pendingCents += o.totalCents;
        pendingCount += 1;
      } else if (o.paymentStatus === "refunded") {
        refundedCents += o.totalCents;
      }
    }
    res.json({
      paidCents,
      pendingCents,
      deliveredCents,
      refundedCents,
      paidCount,
      pendingCount,
      deliveredCount,
      totalOrderCount: all.length,
    });
  });

  // ----------- Audit log -----------
  app.get("/api/admin/audit", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
    const rows = await storage.listAudit(limit);
    res.json(rows);
  });

  // ----------- Vendors / Locations (multi-vendor scaffolding) -----------
  app.get("/api/admin/vendors", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await storage.listVendors());
  });
  app.post("/api/admin/vendors", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      contact: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const v = await storage.createVendor(parsed.data);
    await storage.appendAudit("vendor.created", v.id, { name: v.name });
    res.json(v);
  });
  // ----------- Shop portal (role-scoped) -----------
  app.post("/api/shop/login", async (req, res) => {
    const pin = String(req.body?.pin || "").trim();
    const shop = await storage.getShopByPin(pin);
    if (!shop || !shop.active) {
      return res.status(401).json({ error: "invalid access code" });
    }
    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        address: shop.address,
        contactPhone: shop.contactPhone,
      },
    });
  });

  app.get("/api/shop/orders", async (req, res) => {
    const shop = await requireShop(req, res);
    if (!shop) return;
    const all = await storage.listOrdersForShop(shop.id);
    // Hide canceled/refunded clutter. Keep pending payment in view so the shop
    // can plan ahead but it'll be a no-op for prep buttons until paid.
    res.json(all.filter((o) => o.paymentStatus !== "canceled").map((o) => shopOrderView(o, shop)));
  });

  app.patch("/api/shop/orders/:id/status", async (req, res) => {
    const shop = await requireShop(req, res);
    if (!shop) return;
    const id = Number(req.params.id);
    const next = String(req.body?.shopStatus || "");
    const allowed = ["new", "received", "preparing", "ready_for_pickup"];
    if (!allowed.includes(next)) {
      return res.status(400).json({ error: "bad shop status" });
    }
    const before = await storage.getOrder(id);
    if (!before || before.shopId !== shop.id) {
      return res.status(404).json({ error: "not found" });
    }
    const updated = await storage.updateShopStatus(id, next, shop.id);
    if (!updated) return res.status(404).json({ error: "not found" });
    await storage.appendAudit("shop.status_changed", String(id), {
      shopId: shop.id,
      from: before.shopStatus,
      to: next,
    });
    res.json(shopOrderView(updated, shop));
  });

  // ----------- Driver portal (role-scoped) -----------
  app.post("/api/driver/login", async (req, res) => {
    const pin = String(req.body?.pin || "").trim();
    const driver = await storage.getDriverByPin(pin);
    if (!driver || !driver.active) {
      return res.status(401).json({ error: "invalid access code" });
    }
    res.json({
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
      },
    });
  });

  app.get("/api/driver/orders/available", async (req, res) => {
    const driver = await requireDriver(req, res);
    if (!driver) return;
    const rows = await storage.listAvailableForDrivers();
    const out: any[] = [];
    for (const o of rows) {
      const shop = await storage.getShop(o.shopId || "default");
      out.push(driverOrderView(o, shop));
    }
    res.json(out);
  });

  app.get("/api/driver/orders/active", async (req, res) => {
    const driver = await requireDriver(req, res);
    if (!driver) return;
    const rows = await storage.listOrdersForDriver(driver.id);
    const out: any[] = [];
    for (const o of rows) {
      if (o.driverStatus === "delivered" && Date.now() - (o.claimedAt || 0) > 24 * 3600 * 1000) {
        continue; // hide ancient deliveries
      }
      const shop = await storage.getShop(o.shopId || "default");
      out.push(driverOrderView(o, shop));
    }
    res.json(out);
  });

  app.post("/api/driver/orders/:id/claim", async (req, res) => {
    const driver = await requireDriver(req, res);
    if (!driver) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
    const claimed = await storage.claimOrderForDriver(id, driver.id);
    if (!claimed) {
      return res.status(409).json({ error: "already claimed or unavailable" });
    }
    await storage.appendAudit("order.claimed", String(id), { driverId: driver.id });
    const shop = await storage.getShop(claimed.shopId || "default");
    res.json(driverOrderView(claimed, shop));
  });

  app.patch("/api/driver/orders/:id/status", async (req, res) => {
    const driver = await requireDriver(req, res);
    if (!driver) return;
    const id = Number(req.params.id);
    const next = String(req.body?.driverStatus || "");
    const allowed = ["accepted", "en_route_pickup", "picked_up", "delivered"];
    if (!allowed.includes(next)) {
      return res.status(400).json({ error: "bad driver status" });
    }
    const before = await storage.getOrder(id);
    if (!before || before.driverId !== driver.id) {
      return res.status(404).json({ error: "not found" });
    }
    const updated = await storage.updateDriverStatus(id, next, driver.id);
    if (!updated) return res.status(404).json({ error: "not found" });
    await storage.appendAudit("driver.status_changed", String(id), {
      driverId: driver.id,
      from: before.driverStatus,
      to: next,
    });
    const shop = await storage.getShop(updated.shopId || "default");
    res.json(driverOrderView(updated, shop));
  });

  // ----------- Admin: drivers -----------
  app.get("/api/admin/drivers", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await storage.listDrivers(true));
  });
  app.post("/api/admin/drivers", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      id: z.string().min(1).optional(),
      name: z.string().min(1),
      phone: z.string().max(64).optional(),
      pin: z.string().min(3).max(64).optional(),
      active: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const id = parsed.data.id || slugify(parsed.data.name) || `driver-${Date.now().toString(36)}`;
    const exists = await storage.getDriver(id);
    if (exists) return res.status(409).json({ error: "driver id already exists" });
    const d = await storage.createDriver({
      id,
      name: parsed.data.name,
      phone: parsed.data.phone ?? "",
      pin: parsed.data.pin && parsed.data.pin.length > 0 ? parsed.data.pin : `drive-${Math.random().toString(36).slice(2, 6)}`,
      active: parsed.data.active ?? true,
    });
    await storage.appendAudit("driver.created", d.id, { name: d.name });
    res.json(d);
  });
  app.patch("/api/admin/drivers/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      name: z.string().min(1).optional(),
      phone: z.string().max(64).optional(),
      pin: z.string().min(3).max(64).optional(),
      active: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = await storage.updateDriver(req.params.id, parsed.data as any);
    if (!updated) return res.status(404).json({ error: "not found" });
    await storage.appendAudit("driver.updated", req.params.id, { keys: Object.keys(parsed.data) });
    res.json(updated);
  });

  // Admin: release a stuck driver claim. Frees the order so any driver can
  // pick it up again. Use sparingly — this is the manual override.
  app.post("/api/admin/orders/:id/release-driver", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    const before = await storage.getOrder(id);
    if (!before) return res.status(404).json({ error: "not found" });
    const updated = await storage.releaseOrderClaim(id);
    await storage.appendAudit("order.driver_released", String(id), {
      previousDriverId: before.driverId,
    });
    res.json(updated);
  });

  app.get("/api/admin/locations", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await storage.listLocations());
  });
  app.post("/api/admin/locations", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const schema = z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      address: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const l = await storage.createLocation(parsed.data);
    await storage.appendAudit("location.created", l.id, { name: l.name });
    res.json(l);
  });

  return httpServer;
}
