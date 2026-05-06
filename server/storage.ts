import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  orders,
  productRequests,
  products,
  settings as settingsTable,
  auditLog,
  vendors,
  locations,
} from "@shared/schema";
import type {
  Order,
  InsertOrder,
  ProductRequest,
  InsertProductRequest,
  Product,
  InsertProduct,
  AuditLog,
  Vendor,
  Location,
  PricingSettings,
  OrderSettings,
  NotificationSettings,
  ComplianceSettings,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, count, and } from "drizzle-orm";

const dbPath =
  process.env.PUFFCO_DB_PATH || join(process.cwd(), "data", "puffco.db");
mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Base table creation. Lightweight — running again is safe.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    items TEXT NOT NULL,
    subtotal_cents INTEGER NOT NULL,
    tip_cents INTEGER NOT NULL,
    fee_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL,
    street TEXT NOT NULL,
    unit TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'placed',
    payment_status TEXT NOT NULL DEFAULT 'pending_payment',
    paid_at INTEGER,
    refunded_at INTEGER,
    cashtag_sent INTEGER NOT NULL DEFAULT 0,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    acknowledged_at INTEGER,
    flagged_at INTEGER,
    vendor_id TEXT NOT NULL DEFAULT 'default',
    location_id TEXT NOT NULL DEFAULT 'default'
  );
  CREATE TABLE IF NOT EXISTS product_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    text TEXT NOT NULL,
    category TEXT
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    name TEXT NOT NULL,
    order_name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    base_price_cents INTEGER NOT NULL,
    blurb TEXT NOT NULL,
    detail TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_kind TEXT NOT NULL DEFAULT 'disposable',
    accent TEXT NOT NULL DEFAULT '#ff7a1a',
    active INTEGER NOT NULL DEFAULT 1,
    popular INTEGER NOT NULL DEFAULT 0,
    stock_count INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 3,
    substitute_ids TEXT NOT NULL DEFAULT '[]',
    vendor_id TEXT NOT NULL DEFAULT 'default',
    location_id TEXT NOT NULL DEFAULT 'default'
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    event TEXT NOT NULL,
    subject_id TEXT,
    detail TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
`);

// Lightweight in-place migrations for pre-existing databases. Each ALTER is
// wrapped because SQLite has no IF NOT EXISTS on columns.
function tryAlter(sql: string) {
  try {
    sqlite.exec(sql);
  } catch (err: any) {
    // duplicate column or table errors are expected on reruns
    if (!String(err?.message || "").match(/duplicate column|already exists/i)) {
      // surface anything unexpected, but don't crash boot
      console.warn("[migrate] skipped:", err?.message);
    }
  }
}

[
  "ALTER TABLE products ADD COLUMN stock_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 3",
  "ALTER TABLE products ADD COLUMN substitute_ids TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE products ADD COLUMN vendor_id TEXT NOT NULL DEFAULT 'default'",
  "ALTER TABLE products ADD COLUMN location_id TEXT NOT NULL DEFAULT 'default'",
  "ALTER TABLE orders ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN acknowledged INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN acknowledged_at INTEGER",
  "ALTER TABLE orders ADD COLUMN flagged_at INTEGER",
  "ALTER TABLE orders ADD COLUMN vendor_id TEXT NOT NULL DEFAULT 'default'",
  "ALTER TABLE orders ADD COLUMN location_id TEXT NOT NULL DEFAULT 'default'",
  // Payment workflow + order code (Stage One). Backfilled below.
  "ALTER TABLE orders ADD COLUMN order_code TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending_payment'",
  "ALTER TABLE orders ADD COLUMN paid_at INTEGER",
  "ALTER TABLE orders ADD COLUMN refunded_at INTEGER",
].forEach(tryAlter);

// Backfill orderCode for any pre-existing rows (best effort — keeps customer
// references stable while still satisfying the not-empty constraint when
// admins look at historical orders).
function backfillOrderCodes() {
  try {
    const rows = sqlite
      .prepare("SELECT id FROM orders WHERE order_code = '' OR order_code IS NULL")
      .all() as Array<{ id: number }>;
    const update = sqlite.prepare("UPDATE orders SET order_code = ? WHERE id = ?");
    for (const r of rows) {
      const code = `PC-${String(r.id).padStart(4, "0")}`;
      update.run(code, r.id);
    }
  } catch (err) {
    console.warn("[migrate] backfillOrderCodes:", (err as any)?.message);
  }
}
backfillOrderCodes();

// Best-effort backfill of payment_status for legacy rows: any delivered
// order is assumed paid; canceled stays canceled; everything else stays
// pending_payment. This keeps revenue cards honest after the migration.
function backfillPaymentStatus() {
  try {
    sqlite
      .prepare(
        "UPDATE orders SET payment_status='paid', paid_at=COALESCE(paid_at, created_at) WHERE status='delivered' AND payment_status='pending_payment'",
      )
      .run();
    sqlite
      .prepare(
        "UPDATE orders SET payment_status='canceled' WHERE status='canceled' AND payment_status='pending_payment'",
      )
      .run();
  } catch (err) {
    console.warn("[migrate] backfillPaymentStatus:", (err as any)?.message);
  }
}
backfillPaymentStatus();

export const db = drizzle(sqlite);

// Default operational settings — written into the settings table on first
// boot so the admin UI has something to render. Operators can change them via
// the settings endpoint.
export const DEFAULT_PRICING: PricingSettings = {
  mode: "service_fee",
  serviceFeeFlatCents: 0,
  serviceFeePercent: 0,
  revenueSplitPercent: 18,
  markupPercent: 18,
};

export const DEFAULT_ORDER_SETTINGS: OrderSettings = {
  ackTimeoutMinutes: 5,
  ackTimeoutAction: "flag",
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  operatorPhone: "",
  webhookUrl: "",
  soundEnabled: true,
};

export const DEFAULT_COMPLIANCE: ComplianceSettings = {
  ageGateText: "21+ only — local laws apply.",
  idVerifyText: "Government-issued ID is verified at the door before handoff.",
  legalDisclaimer:
    "Prototype interface. Not legal advice. Operator is responsible for verifying applicable local, state, and federal regulations before launch.",
};

const SETTINGS_DEFAULTS: Record<string, unknown> = {
  pricing: DEFAULT_PRICING,
  orderRules: DEFAULT_ORDER_SETTINGS,
  notifications: DEFAULT_NOTIFICATIONS,
  compliance: DEFAULT_COMPLIANCE,
};

function seedSettingsIfMissing() {
  const now = Date.now();
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    const exists = db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .get();
    if (!exists) {
      db.insert(settingsTable)
        .values({ key, value: JSON.stringify(value), updatedAt: now })
        .run();
    }
  }
}

function seedVendorAndLocationIfEmpty() {
  const now = Date.now();
  const v = db.select({ value: count() }).from(vendors).get();
  if ((v?.value ?? 0) === 0) {
    db.insert(vendors)
      .values({
        id: "default",
        name: "PuffCo Default",
        contact: "",
        active: true,
        createdAt: now,
      })
      .run();
  }
  const l = db.select({ value: count() }).from(locations).get();
  if ((l?.value ?? 0) === 0) {
    db.insert(locations)
      .values({
        id: "default",
        name: "Primary Store",
        address: "",
        active: true,
        createdAt: now,
      })
      .run();
  }
}

const DEFAULT_PRODUCTS: InsertProduct[] = [
  {
    id: "geek-bar-pulse",
    name: "Geek Bar Pulse X - Strawberry B-Pop - 25K Puffs",
    orderName: "Geek Bar Pulse X Strawberry B-Pop 25K",
    brand: "Geek Bar",
    category: "vapes",
    subcategory: "Geek Bar",
    basePriceCents: 2499,
    blurb: "Say it: Geek Bar Pulse X, Strawberry B-Pop, 25K.",
    detail: "Flavor: Strawberry B-Pop · Puff count: 25K",
    imageUrl: "products/geekbar-pulse-x-strawberry-b-pop.jpg",
    imageKind: "disposable",
    accent: "#8ee7ff",
    active: true,
    popular: true,
    stockCount: 12,
    lowStockThreshold: 3,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
  {
    id: "lost-mary-mo5000",
    name: "Lost Mary MO5000 - Black Mint - 5K Puffs",
    orderName: "Lost Mary MO5000 Black Mint 5K",
    brand: "Lost Mary",
    category: "vapes",
    subcategory: "Lost Mary",
    basePriceCents: 2299,
    blurb: "Say it: Lost Mary MO5000, Black Mint, 5K.",
    detail: "Flavor: Black Mint · Puff count: 5K",
    imageUrl: "products/lost-mary-mo5000-black-mint.jpg",
    imageKind: "disposable",
    accent: "#ff9fc8",
    active: true,
    popular: true,
    stockCount: 8,
    lowStockThreshold: 3,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
  {
    id: "raz-dc25000",
    name: "RAZ DC25000 - Strawberry Burst - 25K Puffs",
    orderName: "RAZ DC25000 Strawberry Burst 25K",
    brand: "RAZ",
    category: "vapes",
    subcategory: "RAZ",
    basePriceCents: 2699,
    blurb: "Say it: RAZ DC25000, Strawberry Burst, 25K.",
    detail: "Flavor: Strawberry Burst · Puff count: 25K",
    imageUrl: "products/raz-dc25000-strawberry-burst.jpg",
    imageKind: "disposable",
    accent: "#a7ff83",
    active: true,
    popular: true,
    stockCount: 6,
    lowStockThreshold: 3,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
  {
    id: "rove-cart-og",
    name: "Rove Classics - Waui - 1g Cart",
    orderName: "Rove Classics Waui 1g cart",
    brand: "Rove",
    category: "carts",
    subcategory: "Rove",
    basePriceCents: 3500,
    blurb: "Say it: Rove Classics, Waui, 1g cart.",
    detail: "Strain: Waui · Size: 1g · Type: cartridge",
    imageUrl: "products/rove-waui-1g-cart.jpg",
    imageKind: "cart",
    accent: "#ffb36b",
    active: true,
    popular: true,
    stockCount: 5,
    lowStockThreshold: 2,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
  {
    id: "elements-king-slim",
    name: "Elements King Size Slim Papers - 50 Count",
    orderName: "Elements King Size Slim 50 count",
    brand: "Elements",
    category: "papers",
    subcategory: "Elements",
    basePriceCents: 299,
    blurb: "Say it: Elements King Size Slim, 50 count.",
    detail: "Type: rice rolling papers · Size: king slim",
    imageUrl: "products/elements-king-slim-papers.png",
    imageKind: "papers",
    accent: "#9fd9ff",
    active: true,
    popular: true,
    stockCount: 25,
    lowStockThreshold: 5,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
  {
    id: "grav-beaker",
    name: "GRAV Large Deco Beaker Bong - Clear",
    orderName: "GRAV large deco beaker bong clear",
    brand: "GRAV",
    category: "glass",
    subcategory: "Bongs",
    basePriceCents: 8500,
    blurb: "Say it: GRAV large deco beaker, clear.",
    detail: "Type: beaker bong · Color: clear",
    imageUrl: "products/grav-large-deco-beaker.jpg",
    imageKind: "bong",
    accent: "#95f0ff",
    active: true,
    popular: true,
    stockCount: 3,
    lowStockThreshold: 2,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
  {
    id: "mini-bubbler",
    name: "GRAV Spherical Pocket Bubbler - Clear",
    orderName: "GRAV spherical pocket bubbler clear",
    brand: "GRAV",
    category: "glass",
    subcategory: "Bubblers",
    basePriceCents: 4200,
    blurb: "Say it: GRAV spherical pocket bubbler, clear.",
    detail: "Type: pocket bubbler · Color: clear",
    imageUrl: "products/grav-spherical-pocket-bubbler.jpg",
    imageKind: "bubbler",
    accent: "#b28cff",
    active: true,
    popular: false,
    stockCount: 4,
    lowStockThreshold: 2,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
  {
    id: "backwoods-original",
    name: "Backwoods Original Wild N' Mild - 5 Pack",
    orderName: "Backwoods Original Wild N' Mild 5 pack",
    brand: "Backwoods",
    category: "wraps",
    subcategory: "Backwoods",
    basePriceCents: 999,
    blurb: "Say it: Backwoods Original Wild N' Mild, 5 pack.",
    detail: "Flavor: Original Wild N' Mild · Count: 5 pack",
    imageUrl: "products/backwoods-original-5-pack.jpg",
    imageKind: "wraps",
    accent: "#b87943",
    active: true,
    popular: true,
    stockCount: 18,
    lowStockThreshold: 4,
    substituteIds: "[]",
    vendorId: "default",
    locationId: "default",
  },
];

function seedProductsIfEmpty() {
  const row = db.select({ value: count() }).from(products).get();
  if ((row?.value ?? 0) === 0) {
    const now = Date.now();
    for (const p of DEFAULT_PRODUCTS) {
      db.insert(products)
        .values({ ...p, createdAt: now, updatedAt: now } as any)
        .run();
    }
  }
}

// Backfill stock for products migrated from older builds that defaulted to 0
// (which would make every existing product look out-of-stock). Any product
// that's marked active and currently has stock 0 gets a small starter stock
// so the prototype keeps working out of the box.
function backfillStock() {
  const zeros = db
    .select()
    .from(products)
    .where(and(eq(products.active, true), eq(products.stockCount, 0)))
    .all();
  for (const p of zeros) {
    db.update(products)
      .set({ stockCount: 10, lowStockThreshold: 3 })
      .where(eq(products.id, p.id))
      .run();
  }
}

seedProductsIfEmpty();
seedVendorAndLocationIfEmpty();
seedSettingsIfMissing();
backfillStock();

// ---------------------------------------------------------------------------
// IStorage
// ---------------------------------------------------------------------------

export interface IStorage {
  createOrder(order: InsertOrder, fees: { feeCents: number; totalCents: number }): Promise<Order>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByCode(code: string): Promise<Order | undefined>;
  listOrders(): Promise<Order[]>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  updateOrderPaymentStatus(id: number, paymentStatus: string): Promise<Order | undefined>;
  markCashtagSent(id: number): Promise<Order | undefined>;
  acknowledgeOrder(id: number): Promise<Order | undefined>;
  flagOrder(id: number, reason?: string): Promise<Order | undefined>;
  listUnacknowledgedOlderThan(ms: number): Promise<Order[]>;

  createProductRequest(req: InsertProductRequest): Promise<ProductRequest>;
  listProductRequests(): Promise<ProductRequest[]>;

  listProducts(includeInactive?: boolean): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  adjustStock(id: string, delta: number): Promise<Product | undefined>;
  setStock(id: string, count: number): Promise<Product | undefined>;

  getSetting<T = unknown>(key: string): Promise<T | undefined>;
  setSetting<T = unknown>(key: string, value: T): Promise<T>;
  listSettings(): Promise<Record<string, unknown>>;

  appendAudit(event: string, subjectId: string | null, detail: Record<string, unknown>): Promise<AuditLog>;
  listAudit(limit?: number): Promise<AuditLog[]>;

  listVendors(): Promise<Vendor[]>;
  listLocations(): Promise<Location[]>;
  createVendor(v: { id: string; name: string; contact?: string }): Promise<Vendor>;
  createLocation(l: { id: string; name: string; address?: string }): Promise<Location>;
}

export class DatabaseStorage implements IStorage {
  // Orders ------------------------------------------------------------------
  async createOrder(
    insert: InsertOrder,
    fees: { feeCents: number; totalCents: number },
  ): Promise<Order> {
    const row = db
      .insert(orders)
      .values({
        ...insert,
        feeCents: fees.feeCents,
        totalCents: fees.totalCents,
        createdAt: Date.now(),
      } as any)
      .returning()
      .get();
    // Generate a short, unique order code now that we have the auto-increment
    // id. Format: PC-NNNN (zero-padded). This is what customers paste into the
    // Cash App note so admins can match payments back to orders.
    const code = `PC-${String(row.id).padStart(4, "0")}`;
    const updated = db
      .update(orders)
      .set({ orderCode: code })
      .where(eq(orders.id, row.id))
      .returning()
      .get();
    return (updated || { ...row, orderCode: code }) as Order;
  }
  async getOrder(id: number): Promise<Order | undefined> {
    return db.select().from(orders).where(eq(orders.id, id)).get();
  }
  async getOrderByCode(code: string): Promise<Order | undefined> {
    if (!code) return undefined;
    return db.select().from(orders).where(eq(orders.orderCode, code)).get();
  }
  async listOrders(): Promise<Order[]> {
    return db.select().from(orders).orderBy(desc(orders.createdAt)).all();
  }
  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    return db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning()
      .get();
  }
  async updateOrderPaymentStatus(
    id: number,
    paymentStatus: string,
  ): Promise<Order | undefined> {
    const patch: Record<string, unknown> = { paymentStatus };
    if (paymentStatus === "paid") patch.paidAt = Date.now();
    if (paymentStatus === "refunded") patch.refundedAt = Date.now();
    if (paymentStatus === "pending_payment") {
      patch.paidAt = null;
      patch.refundedAt = null;
    }
    return db
      .update(orders)
      .set(patch as any)
      .where(eq(orders.id, id))
      .returning()
      .get();
  }
  async markCashtagSent(id: number): Promise<Order | undefined> {
    return db
      .update(orders)
      .set({ cashtagSent: true, status: "pay_pending" })
      .where(eq(orders.id, id))
      .returning()
      .get();
  }
  async acknowledgeOrder(id: number): Promise<Order | undefined> {
    return db
      .update(orders)
      .set({ acknowledged: true, acknowledgedAt: Date.now(), flaggedAt: null })
      .where(eq(orders.id, id))
      .returning()
      .get();
  }
  async flagOrder(id: number, _reason?: string): Promise<Order | undefined> {
    return db
      .update(orders)
      .set({ status: "attention_needed", flaggedAt: Date.now() })
      .where(eq(orders.id, id))
      .returning()
      .get();
  }
  async listUnacknowledgedOlderThan(ms: number): Promise<Order[]> {
    const cutoff = Date.now() - ms;
    return db
      .select()
      .from(orders)
      .where(eq(orders.acknowledged, false))
      .all()
      .filter(
        (o) =>
          o.createdAt < cutoff &&
          ["placed", "pay_pending"].includes(o.status),
      );
  }

  // Product requests --------------------------------------------------------
  async createProductRequest(insert: InsertProductRequest): Promise<ProductRequest> {
    const row = db
      .insert(productRequests)
      .values({ ...insert, createdAt: Date.now() })
      .returning()
      .get();
    return row as ProductRequest;
  }
  async listProductRequests(): Promise<ProductRequest[]> {
    return db
      .select()
      .from(productRequests)
      .orderBy(desc(productRequests.createdAt))
      .all();
  }

  // Products ----------------------------------------------------------------
  async listProducts(includeInactive = false): Promise<Product[]> {
    if (includeInactive) {
      return db
        .select()
        .from(products)
        .orderBy(desc(products.popular), desc(products.updatedAt))
        .all();
    }
    return db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(desc(products.popular), desc(products.updatedAt))
      .all();
  }
  async getProduct(id: string): Promise<Product | undefined> {
    return db.select().from(products).where(eq(products.id, id)).get();
  }
  async createProduct(insert: InsertProduct): Promise<Product> {
    const now = Date.now();
    return db
      .insert(products)
      .values({ ...insert, createdAt: now, updatedAt: now } as any)
      .returning()
      .get();
  }
  async updateProduct(id: string, patch: Partial<InsertProduct>): Promise<Product | undefined> {
    return db
      .update(products)
      .set({ ...patch, updatedAt: Date.now() } as any)
      .where(eq(products.id, id))
      .returning()
      .get();
  }
  async deleteProduct(id: string): Promise<boolean> {
    const result = db.delete(products).where(eq(products.id, id)).run();
    return result.changes > 0;
  }
  async adjustStock(id: string, delta: number): Promise<Product | undefined> {
    const current = await this.getProduct(id);
    if (!current) return undefined;
    const next = Math.max(0, current.stockCount + delta);
    return db
      .update(products)
      .set({ stockCount: next, updatedAt: Date.now() })
      .where(eq(products.id, id))
      .returning()
      .get();
  }
  async setStock(id: string, countValue: number): Promise<Product | undefined> {
    return db
      .update(products)
      .set({ stockCount: Math.max(0, countValue), updatedAt: Date.now() })
      .where(eq(products.id, id))
      .returning()
      .get();
  }

  // Settings ----------------------------------------------------------------
  async getSetting<T = unknown>(key: string): Promise<T | undefined> {
    const row = db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .get();
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as unknown as T;
    }
  }
  async setSetting<T = unknown>(key: string, value: T): Promise<T> {
    const exists = await this.getSetting(key);
    const json = JSON.stringify(value);
    if (exists === undefined) {
      db.insert(settingsTable)
        .values({ key, value: json, updatedAt: Date.now() })
        .run();
    } else {
      db.update(settingsTable)
        .set({ value: json, updatedAt: Date.now() })
        .where(eq(settingsTable.key, key))
        .run();
    }
    return value;
  }
  async listSettings(): Promise<Record<string, unknown>> {
    const rows = db.select().from(settingsTable).all();
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        out[r.key] = r.value;
      }
    }
    // Always merge defaults so a missing key never breaks the UI.
    return { ...SETTINGS_DEFAULTS, ...out };
  }

  // Audit log ---------------------------------------------------------------
  async appendAudit(
    event: string,
    subjectId: string | null,
    detail: Record<string, unknown>,
  ): Promise<AuditLog> {
    return db
      .insert(auditLog)
      .values({
        createdAt: Date.now(),
        event,
        subjectId: subjectId ?? null,
        detail: JSON.stringify(detail ?? {}),
      } as any)
      .returning()
      .get() as AuditLog;
  }
  async listAudit(limit = 200): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .all();
  }

  // Vendors / Locations -----------------------------------------------------
  async listVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).orderBy(desc(vendors.createdAt)).all();
  }
  async listLocations(): Promise<Location[]> {
    return db.select().from(locations).orderBy(desc(locations.createdAt)).all();
  }
  async createVendor(v: { id: string; name: string; contact?: string }): Promise<Vendor> {
    return db
      .insert(vendors)
      .values({
        id: v.id,
        name: v.name,
        contact: v.contact || "",
        active: true,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async createLocation(l: { id: string; name: string; address?: string }): Promise<Location> {
    return db
      .insert(locations)
      .values({
        id: l.id,
        name: l.name,
        address: l.address || "",
        active: true,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
}

export const storage = new DatabaseStorage();
