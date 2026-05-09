import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Orders table — prototype only. Address is stored only with the order
// for fulfillment. No persistent customer profiles, no DOB, no ID images,
// no payment data.
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Short, human-friendly order code customers reference in Cash App notes.
  // Format: PG01, PG02, etc. Must be unique.
  orderCode: text("order_code").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  // Items as JSON: [{id, name, brand, qty, basePrice, estPrice}]
  items: text("items").notNull(),
  subtotal: integer("subtotal_cents").notNull(),
  tipCents: integer("tip_cents").notNull(),
  // Minimal customer contact stored with the order so the operator and the
  // driver can identify and reach the customer. No persistent customer
  // profiles — fields live only on the order row.
  customerFirstName: text("customer_first_name").notNull().default(""),
  customerLastInitial: text("customer_last_initial").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  // Service fee or revenue split share applied by the configured pricing mode.
  // Stored on the order so historical orders keep their original total even if
  // the global pricing settings later change. Never exposes supplier cost.
  feeCents: integer("fee_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  // Delivery address (this order only)
  street: text("street").notNull(),
  unit: text("unit"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  notes: text("notes"),
  // Status: placed | pay_pending | confirmed | en_route | delivered | canceled |
  // attention_needed (flagged by the timeout sweeper when not acknowledged)
  status: text("status").notNull().default("placed"),
  // Payment status is tracked separately from fulfillment status so admins
  // can confirm the Cash App transfer landed before counting an order as
  // revenue. Values: pending_payment | paid | refund_due | refunded | canceled
  paymentStatus: text("payment_status").notNull().default("pending_payment"),
  paidAt: integer("paid_at"),
  refundedAt: integer("refunded_at"),
  cashtagSent: integer("cashtag_sent", { mode: "boolean" }).notNull().default(false),
  // Acknowledgement state — the operator must explicitly acknowledge new orders.
  // If left unacknowledged past the timeout window, the sweeper flags the order
  // as attention_needed (or canceled, per settings).
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
  acknowledgedAt: integer("acknowledged_at"),
  flaggedAt: integer("flagged_at"),
  // Future multi-vendor / multi-location support. Defaults to "default"
  // so a single store works without configuration.
  vendorId: text("vendor_id").notNull().default("default"),
  locationId: text("location_id").notNull().default("default"),
  // Customer-facing local shop association.
  shopId: text("shop_id").notNull().default("default"),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderCode: true,
  createdAt: true,
  status: true,
  paymentStatus: true,
  paidAt: true,
  refundedAt: true,
  cashtagSent: true,
  acknowledged: true,
  acknowledgedAt: true,
  flaggedAt: true,
  feeCents: true,
});

export const PAYMENT_STATUSES = [
  "pending_payment",
  "paid",
  "refund_due",
  "refunded",
  "canceled",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Write-in product requests (popular requests dashboard).
// Anonymous — no customer link.
export const productRequests = sqliteTable("product_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull(),
  text: text("text").notNull(),
  // optional category hint
  category: text("category"),
});

export const insertProductRequestSchema = createInsertSchema(productRequests).omit({
  id: true,
  createdAt: true,
});

export type InsertProductRequest = z.infer<typeof insertProductRequestSchema>;
export type ProductRequest = typeof productRequests.$inferSelect;

// Admin-managed products. Images are stored as URLs or data URLs so non-coders
// can paste a link or upload a photo from the admin page.
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  name: text("name").notNull(),
  orderName: text("order_name").notNull(),
  brand: text("brand").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  basePriceCents: integer("base_price_cents").notNull(),
  blurb: text("blurb").notNull(),
  detail: text("detail").notNull(),
  imageUrl: text("image_url").notNull(),
  imageKind: text("image_kind").notNull().default("disposable"),
  accent: text("accent").notNull().default("#ff7a1a"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  popular: integer("popular", { mode: "boolean" }).notNull().default(false),
  // Lightweight inventory control. availability is derived: active && stockCount > 0
  stockCount: integer("stock_count").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
  // Optional approved substitutes — a JSON array of product IDs the operator
  // has pre-approved as alternatives. If empty, the substitution engine falls
  // back to same category + same subcategory matches.
  substituteIds: text("substitute_ids").notNull().default("[]"),
  // Future multi-vendor / multi-location fields. Default to "default" so a
  // single-store deployment keeps working with no configuration.
  vendorId: text("vendor_id").notNull().default("default"),
  locationId: text("location_id").notNull().default("default"),
  // Customer-facing "shop" — distinct from vendor in the UI. Existing rows
  // are migrated onto a "default" shop on first boot so the catalog never
  // disappears.
  shopId: text("shop_id").notNull().default("default"),
});

export const insertProductSchema = createInsertSchema(products).omit({
  createdAt: true,
  updatedAt: true,
});

export const productInputSchema = insertProductSchema.extend({
  id: z.string().optional(),
  name: z.string().min(2),
  orderName: z.string().min(2),
  brand: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  basePriceCents: z.number().int().min(0),
  imageUrl: z.string().min(1),
  active: z.boolean().default(true),
  popular: z.boolean().default(false),
  stockCount: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(3),
  substituteIds: z.string().default("[]"),
  vendorId: z.string().default("default"),
  locationId: z.string().default("default"),
  shopId: z.string().default("default"),
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Helpful shape for parsed order items
export const orderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string(),
  qty: z.number().int().min(1),
  basePriceCents: z.number().int().min(0),
  estPriceCents: z.number().int().min(0),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

// Key/value settings — admin-configurable runtime knobs (pricing mode, fees,
// ack timeout window, notification phone/webhook). Stored as JSON strings so
// the same row can hold any shape without schema migrations.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type Setting = typeof settings.$inferSelect;

// Default operational settings. Mirrored on disk through the settings table.
export type PricingSettings = {
  // "service_fee" charges a flat or percentage service/delivery fee on top of
  // listed (already-marked-up) prices. "revenue_split" treats the listed price
  // as gross and a configured percentage is recorded as the platform's revenue
  // share — both modes never expose supplier cost on the customer side.
  mode: "service_fee" | "revenue_split";
  // Used when mode = "service_fee"
  serviceFeeFlatCents: number;
  serviceFeePercent: number; // e.g. 5 = 5%
  // Used when mode = "revenue_split"
  revenueSplitPercent: number; // platform share
  // Customer-facing markup (kept in sync with the existing client constant)
  markupPercent: number;
};

export type OrderSettings = {
  // Minutes after an order is placed before it is auto-flagged if not
  // acknowledged. 0 disables auto-flagging.
  ackTimeoutMinutes: number;
  // Action when the timeout fires: flag (status=attention_needed) or cancel.
  ackTimeoutAction: "flag" | "cancel";
};

export type NotificationSettings = {
  // Operator phone number for SMS alerts (placeholder — provider must be
  // configured via env vars before any real SMS is sent).
  operatorPhone: string;
  // Webhook URL for push/Slack/Discord notifications. Optional.
  webhookUrl: string;
  // Toggle in-app sound alerts (audio cue on the admin Live Orders feed).
  soundEnabled: boolean;
};

export type ComplianceSettings = {
  ageGateText: string;
  idVerifyText: string;
  legalDisclaimer: string;
};

// Audit log — every order status change, acknowledgement, stock adjustment,
// settings change, and substitution decision is appended here for
// accountability. Keep entries small and JSON-serialisable.
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull(),
  // e.g. "order.created", "order.status_changed", "order.acknowledged",
  // "order.flagged", "product.stock_changed", "settings.updated",
  // "cart.substitution_offered", "cart.substitution_accepted",
  // "cart.substitution_declined".
  event: text("event").notNull(),
  // Subject identifier — order id, product id, settings key, etc.
  subjectId: text("subject_id"),
  // JSON payload with details (before/after, source IP if useful, etc.)
  detail: text("detail").notNull().default("{}"),
});
export type AuditLog = typeof auditLog.$inferSelect;

// Future multi-vendor / multi-location support. The single-store default seeds
// one row in each table so the rest of the schema can reference foreign keys
// without changing behaviour.
export const vendors = sqliteTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});
export type Vendor = typeof vendors.$inferSelect;

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});
export type Location = typeof locations.$inferSelect;

// Customer-facing "local shops". Internally maps onto the vendor concept but
// presented as a shop in the UI. Each shop has its own fees and an optional
// service area note. Always treat customer-facing prices as final/display.
export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  blurb: text("blurb").notNull().default(""),
  serviceArea: text("service_area").notNull().default(""),
  notes: text("notes").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  open: integer("open", { mode: "boolean" }).notNull().default(true),
  serviceFeeCents: integer("service_fee_cents").notNull().default(0),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  imageUrl: text("image_url").notNull().default(""),
  accent: text("accent").notNull().default("#ff7a1a"),
  createdAt: integer("created_at").notNull(),
});
export type Shop = typeof shops.$inferSelect;
