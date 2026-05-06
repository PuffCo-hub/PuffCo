import type { Express } from "express";
import type { Server } from "node:http";
import { storage, DEFAULT_PRICING, DEFAULT_ORDER_SETTINGS, DEFAULT_NOTIFICATIONS, DEFAULT_COMPLIANCE } from "./storage";
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
import { findSubstitutes } from "./substitutions";
import { notify } from "./notifications";
import { startSweeper, runOnce } from "./sweeper";
import { z } from "zod";

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
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Kick off background timeout sweeper (process-wide, idempotent).
  startSweeper();

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

    for (const it of items) {
      await storage.adjustStock(it.id, -it.qty);
    }

    const order = await storage.createOrder(parsed.data, {
      feeCents: breakdown.feeCents,
      totalCents: breakdown.totalCents,
    });

    await storage.appendAudit("order.created", String(order.id), {
      total: order.totalCents,
      itemCount: items.length,
      vendorId: order.vendorId,
      locationId: order.locationId,
    });

    // Best-effort notification — never blocks the response.
    storage
      .getSetting<NotificationSettings>("notifications")
      .then((notif) =>
        notify(
          {
            title: `New order ${order.orderCode || "#" + order.id}`,
            body: `Total $${(order.totalCents / 100).toFixed(2)} — watch Cash App note for ${order.orderCode || "#" + order.id}.`,
            tag: "order.new",
            subjectId: String(order.id),
          },
          notif || DEFAULT_NOTIFICATIONS,
        ),
      )
      .catch(() => {});

    res.json(order);
  });

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

  // Lookup by short order code (PG-NNNN). Useful for admin search and for the
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
    const all = await storage.listProducts(includeInactive);
    res.json(all.map(publicProduct));
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
