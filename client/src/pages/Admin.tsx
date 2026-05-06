import { Shell } from "@/components/Shell";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Order,
  OrderItem,
  Product,
  ProductRequest,
  AuditLog,
  Vendor,
  Location,
  PricingSettings,
  OrderSettings,
  NotificationSettings,
  ComplianceSettings,
} from "@shared/schema";
import { CATEGORY_OPTIONS, formatPrice } from "@/lib/catalog";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Package,
  MessageSquareDot,
  Wallet,
  Clock,
  Truck,
  Plus,
  Pencil,
  Trash2,
  ImagePlus,
  Eye,
  EyeOff,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Settings as SettingsIcon,
  ScrollText,
  Building2,
  PackageMinus,
  PackagePlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Tab =
  | "products"
  | "orders"
  | "writeins"
  | "settings"
  | "audit"
  | "vendors";

type ProductForm = {
  id?: string;
  name: string;
  orderName: string;
  brand: string;
  category: string;
  subcategory: string;
  price: string;
  blurb: string;
  detail: string;
  imageUrl: string;
  imageKind: string;
  accent: string;
  active: boolean;
  popular: boolean;
  stockCount: string;
  lowStockThreshold: string;
  substituteIds: string; // comma-separated
  vendorId: string;
  locationId: string;
};

const blankForm: ProductForm = {
  name: "",
  orderName: "",
  brand: "",
  category: "vapes",
  subcategory: "",
  price: "",
  blurb: "",
  detail: "",
  imageUrl: "",
  imageKind: "disposable",
  accent: "#ff7a1a",
  active: true,
  popular: false,
  stockCount: "10",
  lowStockThreshold: "3",
  substituteIds: "",
  vendorId: "default",
  locationId: "default",
};

function centsFromPrice(value: string) {
  const n = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function formFromProduct(p: Product): ProductForm {
  let subs: string[] = [];
  try {
    subs = JSON.parse((p as any).substituteIds || "[]");
  } catch {
    subs = [];
  }
  return {
    id: p.id,
    name: p.name,
    orderName: p.orderName,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    price: (p.basePriceCents / 100).toFixed(2),
    blurb: p.blurb,
    detail: p.detail,
    imageUrl: p.imageUrl,
    imageKind: p.imageKind,
    accent: p.accent,
    active: p.active,
    popular: p.popular,
    stockCount: String(p.stockCount ?? 0),
    lowStockThreshold: String(p.lowStockThreshold ?? 3),
    substituteIds: subs.join(", "),
    vendorId: (p as any).vendorId || "default",
    locationId: (p as any).locationId || "default",
  };
}

function payloadFromForm(form: ProductForm) {
  const subs = form.substituteIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    id: form.id,
    name: form.name.trim(),
    orderName: form.orderName.trim(),
    brand: form.brand.trim(),
    category: form.category,
    subcategory: form.subcategory.trim(),
    basePriceCents: centsFromPrice(form.price),
    blurb: form.blurb.trim() || `Say it: ${form.orderName.trim()}.`,
    detail: form.detail.trim(),
    imageUrl: form.imageUrl.trim(),
    imageKind: form.imageKind || "disposable",
    accent: form.accent || "#ff7a1a",
    active: form.active,
    popular: form.popular,
    stockCount: Math.max(0, Math.round(Number(form.stockCount) || 0)),
    lowStockThreshold: Math.max(0, Math.round(Number(form.lowStockThreshold) || 0)),
    substituteIds: subs,
    vendorId: form.vendorId || "default",
    locationId: form.locationId || "default",
  };
}

// ---------------------------------------------------------------------------
// Audio cue for new orders. Uses WebAudio (no asset needed) so deploy stays
// self-contained.
// ---------------------------------------------------------------------------
function playAlertTone() {
  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    /* ignore */
  }
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>("orders");
  const [form, setForm] = useState<ProductForm>(blankForm);
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");

  async function unlockAdmin() {
    setAuthError("");
    try {
      await adminRequest(pin, "GET", "/api/admin/settings");
      setAuthed(true);
    } catch {
      setAuthed(false);
      setAuthError("That PIN did not work. Check the PIN saved in Render.");
    }
  }

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    refetchInterval: 5000,
  });
  const { data: requests = [] } = useQuery<ProductRequest[]>({
    queryKey: ["/api/requests"],
    refetchInterval: 5000,
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products?all=true"],
    refetchInterval: 5000,
  });
  const { data: settings } = useQuery<{
    pricing: PricingSettings;
    orderRules: OrderSettings;
    notifications: NotificationSettings;
    compliance: ComplianceSettings;
    substitution: { priceDeltaThresholdCents: number };
  }>({
    queryKey: ["/api/admin/settings"],
    enabled: authed,
    queryFn: async () => {
      const res = await adminRequest(pin, "GET", "/api/admin/settings");
      return res.json();
    },
  });
  const { data: auditRows = [] } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit"],
    enabled: authed && tab === "audit",
    refetchInterval: tab === "audit" ? 4000 : false,
    queryFn: async () => {
      const res = await adminRequest(pin, "GET", "/api/admin/audit?limit=200");
      return res.json();
    },
  });
  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/admin/vendors"],
    enabled: authed,
    queryFn: async () => {
      const res = await adminRequest(pin, "GET", "/api/admin/vendors");
      return res.json();
    },
  });
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/admin/locations"],
    enabled: authed,
    queryFn: async () => {
      const res = await adminRequest(pin, "GET", "/api/admin/locations");
      return res.json();
    },
  });
  const { data: revenue } = useQuery<{
    paidCents: number;
    pendingCents: number;
    deliveredCents: number;
    refundedCents: number;
    paidCount: number;
    pendingCount: number;
    deliveredCount: number;
    totalOrderCount: number;
  }>({
    queryKey: ["/api/admin/revenue"],
    enabled: authed,
    refetchInterval: authed ? 5000 : false,
    queryFn: async () => {
      const res = await adminRequest(pin, "GET", "/api/admin/revenue");
      return res.json();
    },
  });

  // Audio + visual cue: when a new order id appears, fire the chime once.
  const lastSeenRef = useRef<number | null>(null);
  useEffect(() => {
    if (orders.length === 0) return;
    const newest = Math.max(...orders.map((o) => o.id));
    if (lastSeenRef.current === null) {
      lastSeenRef.current = newest;
      return;
    }
    if (newest > lastSeenRef.current) {
      lastSeenRef.current = newest;
      const newOrders = orders.filter(
        (o) => !o.acknowledged && o.status === "placed",
      );
      if (newOrders.length > 0 && (settings?.notifications?.soundEnabled ?? true)) {
        playAlertTone();
      }
    }
  }, [orders, settings?.notifications?.soundEnabled]);

  const saveProduct = useMutation({
    mutationFn: async () => {
      const payload = payloadFromForm(form);
      if (!payload.name || !payload.orderName || !payload.brand || !payload.subcategory || !payload.imageUrl) {
        throw new Error("Missing required fields.");
      }
      const res = form.id
        ? await adminRequest(pin, "PATCH", `/api/products/${form.id}`, payload)
        : await adminRequest(pin, "POST", "/api/products", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products?all=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setForm(blankForm);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      await adminRequest(pin, "DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products?all=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const adjustStock = useMutation({
    mutationFn: async (args: { id: string; delta?: number; set?: number }) => {
      const body: any = {};
      if (typeof args.delta === "number") body.delta = args.delta;
      if (typeof args.set === "number") body.set = args.set;
      await adminRequest(pin, "POST", `/api/products/${args.id}/stock`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products?all=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const acknowledge = useMutation({
    mutationFn: async (id: number) => {
      await adminRequest(pin, "POST", `/api/orders/${id}/acknowledge`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (args: { id: number; status: string }) => {
      await adminRequest(pin, "POST", `/api/orders/${args.id}/status`, {
        status: args.status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
    },
  });

  const updatePaymentStatus = useMutation({
    mutationFn: async (args: { id: number; paymentStatus: string }) => {
      await adminRequest(pin, "POST", `/api/orders/${args.id}/payment-status`, {
        paymentStatus: args.paymentStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (patch: any) => {
      const res = await adminRequest(pin, "PATCH", "/api/admin/settings", patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const activeCount = products.filter((p) => p.active).length;
  const lowStock = products.filter(
    (p) => p.active && p.stockCount > 0 && p.stockCount <= p.lowStockThreshold,
  );
  const outOfStock = products.filter((p) => p.active && p.stockCount === 0);
  const unackCount = orders.filter(
    (o) => !o.acknowledged && ["placed", "pay_pending"].includes(o.status),
  ).length;
  const flaggedCount = orders.filter((o) => o.status === "attention_needed").length;

  const topProducts = useMemo(() => {
    const productCounts = new Map<string, { name: string; qty: number; brand: string }>();
    for (const o of orders) {
      let items: OrderItem[] = [];
      try {
        items = JSON.parse(o.items);
      } catch {
        /* ignore */
      }
      for (const it of items) {
        const cur = productCounts.get(it.id);
        if (cur) cur.qty += it.qty;
        else productCounts.set(it.id, { name: it.name, brand: it.brand, qty: it.qty });
      }
    }
    return Array.from(productCounts.entries()).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);
  }, [orders]);

  const popularReqs = useMemo(() => {
    const reqCounts = new Map<string, number>();
    const reqLatestText = new Map<string, string>();
    for (const r of requests) {
      const k = r.text.trim().toLowerCase();
      reqCounts.set(k, (reqCounts.get(k) ?? 0) + 1);
      reqLatestText.set(k, r.text);
    }
    return Array.from(reqCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, count]) => ({ text: reqLatestText.get(k) || k, count }));
  }, [requests]);

  return (
    <Shell title="Store manager" back="/menu" showCart={false}>
      {!authed ? (
        <div className="bg-card border border-card-border rounded-3xl p-5 mb-5">
          <h2 className="text-lg font-semibold mb-1">Admin access</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter the admin PIN to manage products, orders, and settings.
            Visitors can still browse the store.
          </p>
          <Input
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setAuthError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") unlockAdmin();
            }}
            placeholder="Admin PIN"
            type="password"
            className="mb-3"
            data-testid="input-admin-pin"
          />
          <Button className="ember-button w-full mb-3" onClick={unlockAdmin}>
            Unlock admin
          </Button>
          {authError ? (
            <div className="text-xs text-destructive mb-2">{authError}</div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            Use the admin PIN saved in your hosting settings.
          </div>
        </div>
      ) : null}

      {authed && (unackCount > 0 || flaggedCount > 0 || lowStock.length > 0 || outOfStock.length > 0) ? (
        <div
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 mb-3 space-y-1.5"
          data-testid="banner-attention"
        >
          {unackCount > 0 ? (
            <div className="flex items-center gap-2 text-xs">
              <Bell className="size-3.5 text-amber-500" />
              <span>
                <strong>{unackCount}</strong> unacknowledged{" "}
                {unackCount === 1 ? "order needs" : "orders need"} attention.
              </span>
            </div>
          ) : null}
          {flaggedCount > 0 ? (
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="size-3.5 text-destructive" />
              <span>
                <strong>{flaggedCount}</strong> flagged{" "}
                {flaggedCount === 1 ? "order — auto-flagged after timeout." : "orders — auto-flagged after timeout."}
              </span>
            </div>
          ) : null}
          {outOfStock.length > 0 ? (
            <div className="flex items-center gap-2 text-xs">
              <PackageMinus className="size-3.5 text-destructive" />
              <span>
                <strong>{outOfStock.length}</strong> products out of stock.
              </span>
            </div>
          ) : null}
          {lowStock.length > 0 ? (
            <div className="flex items-center gap-2 text-xs">
              <PackagePlus className="size-3.5 text-amber-500" />
              <span>
                <strong>{lowStock.length}</strong> products at or below
                low-stock threshold.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 mb-2">
        <KPI
          icon={Wallet}
          label="Paid"
          value={formatPrice(revenue?.paidCents ?? 0)}
          sub={`${revenue?.paidCount ?? 0} orders`}
          tone="positive"
          testid="kpi-paid"
        />
        <KPI
          icon={Clock}
          label="Pending"
          value={formatPrice(revenue?.pendingCents ?? 0)}
          sub={`${revenue?.pendingCount ?? 0} unpaid`}
          tone="warning"
          testid="kpi-pending"
        />
        <KPI
          icon={Truck}
          label="Delivered"
          value={formatPrice(revenue?.deliveredCents ?? 0)}
          sub={`${revenue?.deliveredCount ?? 0} fulfilled`}
          testid="kpi-delivered"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <KPI icon={Package} label="Products" value={String(activeCount)} testid="kpi-products" />
        <KPI icon={MessageSquareDot} label="Write-ins" value={String(requests.length)} testid="kpi-requests" />
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto">
        <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
          Orders {unackCount + flaggedCount > 0 ? <span className="ml-1 inline-flex items-center justify-center size-4 rounded-full bg-destructive text-destructive-foreground text-[10px]">{unackCount + flaggedCount}</span> : null}
        </TabButton>
        <TabButton active={tab === "products"} onClick={() => setTab("products")}>Products</TabButton>
        <TabButton active={tab === "writeins"} onClick={() => setTab("writeins")}>Write-ins</TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>Settings</TabButton>
        <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>Audit</TabButton>
        <TabButton active={tab === "vendors"} onClick={() => setTab("vendors")}>Vendors</TabButton>
      </div>

      {tab === "products" && authed ? (
        <>
          <ProductEditor form={form} setForm={setForm} onSave={() => saveProduct.mutate()} saving={saveProduct.isPending} error={saveProduct.error?.message} vendors={vendors} locations={locations} />
          <Section title="Current product list">
            {products.length === 0 ? (
              <Empty text="No products yet." />
            ) : (
              <div className="space-y-2">
                {products.map((p) => {
                  const oos = p.stockCount === 0;
                  const low = !oos && p.stockCount <= p.lowStockThreshold;
                  return (
                    <div
                      key={p.id}
                      className={`bg-card border rounded-2xl p-3 flex gap-3 items-center ${
                        oos ? "border-destructive/40" : low ? "border-amber-500/40" : "border-card-border"
                      }`}
                      data-testid={`admin-product-${p.id}`}
                    >
                      <img src={p.imageUrl} alt={p.name} className="size-14 rounded-xl bg-white object-contain p-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground flex-wrap">
                          {p.active ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                          {p.brand} · {p.category}
                          {p.popular ? <span className="text-primary">· Trending</span> : null}
                          {oos ? (
                            <span className="text-destructive font-semibold">· Out of stock</span>
                          ) : low ? (
                            <span className="text-amber-500 font-semibold">· Low</span>
                          ) : null}
                        </div>
                        <div className="font-semibold text-sm line-clamp-1">{p.orderName}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {formatPrice(p.basePriceCents)} · stock {p.stockCount}/{p.lowStockThreshold} · {p.detail}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          <button
                            className="size-8 rounded-full bg-secondary flex items-center justify-center hover-elevate"
                            onClick={() => adjustStock.mutate({ id: p.id, delta: -1 })}
                            data-testid={`button-stock-dec-${p.id}`}
                            aria-label="Decrease stock"
                          >
                            <PackageMinus className="size-3.5" />
                          </button>
                          <button
                            className="size-8 rounded-full bg-secondary flex items-center justify-center hover-elevate"
                            onClick={() => adjustStock.mutate({ id: p.id, delta: 1 })}
                            data-testid={`button-stock-inc-${p.id}`}
                            aria-label="Increase stock"
                          >
                            <PackagePlus className="size-3.5" />
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <button className="size-8 rounded-full bg-secondary flex items-center justify-center hover-elevate" onClick={() => setForm(formFromProduct(p))} data-testid={`button-edit-${p.id}`}>
                            <Pencil className="size-3.5" />
                          </button>
                          <button className="size-8 rounded-full bg-secondary flex items-center justify-center hover-elevate text-destructive" onClick={() => deleteProduct.mutate(p.id)} data-testid={`button-delete-${p.id}`}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      ) : tab === "products" ? <Empty text="Enter the admin PIN above to manage products." /> : null}

      {tab === "orders" ? (
        <>
          <Section title="Live orders">
            {orders.length === 0 ? (
              <Empty text="No orders yet." />
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 25).map((o) => {
                  const needsAck =
                    !o.acknowledged && ["placed", "pay_pending"].includes(o.status);
                  const flagged = o.status === "attention_needed";
                  const payStatus = (o as any).paymentStatus || "pending_payment";
                  const orderCode = (o as any).orderCode || `PG${String(o.id).padStart(2, "0")}`;
                  const isUnpaid = payStatus === "pending_payment";
                  let orderedItems: OrderItem[] = [];
                  try {
                    orderedItems = JSON.parse(o.items || "[]");
                  } catch {
                    orderedItems = [];
                  }
                  const fullAddress = [
                    o.street,
                    o.unit ? `Unit ${o.unit}` : "",
                    `${o.city}, ${o.state} ${o.zip}`,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <div
                      key={o.id}
                      className={`glass-card rounded-xl p-3 ${
                        flagged
                          ? "ring-1 ring-destructive/50"
                          : needsAck
                          ? "ring-1 ring-amber-500/50"
                          : isUnpaid
                          ? "ring-1 ring-amber-400/30"
                          : ""
                      }`}
                      data-testid={`admin-order-${o.id}`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="rounded-2xl border border-primary/35 bg-primary/10 p-3 mb-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-primary/90 font-bold">
                              Order code
                            </div>
                            <div
                              className="font-mono text-3xl font-black text-primary tracking-widest leading-none mt-1"
                              data-testid={`text-order-code-${o.id}`}
                            >
                              {orderCode}
                            </div>
                            {isUnpaid ? (
                              <div className="mt-2 text-[12px] text-amber-200">
                                Match this against the Cash App note before marking paid.
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <PaymentBadge status={payStatus} />
                            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                              #{o.id} · {o.status}
                            </span>
                            {needsAck ? (
                              <span className="text-amber-500 font-semibold">· Needs ack</span>
                            ) : null}
                            {flagged ? (
                              <span className="text-destructive font-semibold">· Flagged</span>
                            ) : null}
                            {o.acknowledged ? (
                              <span className="text-emerald-500 inline-flex items-center gap-0.5">
                                <CheckCircle2 className="size-3" /> ack'd
                              </span>
                            ) : null}
                          </div>

                          <div className="rounded-2xl border border-card-border bg-background/55 p-3 mb-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                              Deliver to
                            </div>
                            <div className="text-base font-bold leading-snug" data-testid={`text-order-address-${o.id}`}>
                              {fullAddress}
                            </div>
                            {o.notes ? (
                              <div className="text-xs text-muted-foreground mt-1">
                                Notes: {o.notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-2xl border border-card-border bg-background/55 p-3 mb-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                              Items to deliver
                            </div>
                            {orderedItems.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No item details saved.</div>
                            ) : (
                              <div className="space-y-2">
                                {orderedItems.map((item, idx) => (
                                  <div
                                    key={`${item.id}-${idx}`}
                                    className="flex items-start justify-between gap-3 rounded-xl bg-card/70 border border-border/50 px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-semibold text-sm leading-snug">
                                        {item.qty}× {item.brand ? `${item.brand} ` : ""}
                                        {item.name}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground font-mono">
                                        Product ID: {item.id}
                                      </div>
                                    </div>
                                    <div className="text-sm font-bold tabular-nums shrink-0">
                                      {formatPrice(item.estPriceCents * item.qty)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            {new Date(o.createdAt).toLocaleTimeString()} ·{" "}
                            <span className="font-semibold text-foreground">{formatPrice(o.totalCents)}</span>
                            {o.feeCents > 0 ? (
                              <span className="opacity-70"> · fee {formatPrice(o.feeCents)}</span>
                            ) : null}
                          </div>
                          {isUnpaid ? (
                            <div className="mt-1.5 text-[11px] bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 text-amber-200">
                              Watch Cash App for note: <span className="font-mono font-bold">{orderCode}</span>
                            </div>
                          ) : null}
                        </div>
                        {authed ? (
                          <div className="flex flex-col gap-1 shrink-0">
                            {needsAck ? (
                              <Button
                                size="sm"
                                className="ember-button h-8 px-2 text-[11px]"
                                onClick={() => acknowledge.mutate(o.id)}
                                data-testid={`button-ack-${o.id}`}
                              >
                                Acknowledge
                              </Button>
                            ) : null}
                            {payStatus === "pending_payment" ? (
                              <Button
                                size="sm"
                                className="h-8 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white"
                                onClick={() =>
                                  updatePaymentStatus.mutate({ id: o.id, paymentStatus: "paid" })
                                }
                                data-testid={`button-mark-paid-${o.id}`}
                              >
                                Mark Paid
                              </Button>
                            ) : null}
                            {payStatus === "paid" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-[11px]"
                                  onClick={() =>
                                    updatePaymentStatus.mutate({
                                      id: o.id,
                                      paymentStatus: "refund_due",
                                    })
                                  }
                                  data-testid={`button-mark-refund-due-${o.id}`}
                                >
                                  Refund due
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-[11px]"
                                  onClick={() =>
                                    updatePaymentStatus.mutate({
                                      id: o.id,
                                      paymentStatus: "pending_payment",
                                    })
                                  }
                                  data-testid={`button-mark-pending-${o.id}`}
                                >
                                  Mark unpaid
                                </Button>
                              </>
                            ) : null}
                            {payStatus === "refund_due" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-[11px]"
                                onClick={() =>
                                  updatePaymentStatus.mutate({
                                    id: o.id,
                                    paymentStatus: "refunded",
                                  })
                                }
                                data-testid={`button-mark-refunded-${o.id}`}
                              >
                                Mark refunded
                              </Button>
                            ) : null}
                            {!["delivered", "canceled"].includes(o.status) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-[11px]"
                                onClick={() =>
                                  updateStatus.mutate({ id: o.id, status: "canceled" })
                                }
                                data-testid={`button-cancel-${o.id}`}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
          <Section title="Top products">
            {topProducts.length === 0 ? (
              <Empty text="No products sold yet." />
            ) : (
              <div className="space-y-1.5">
                {topProducts.map(([id, p]) => (
                  <div key={id} className="flex justify-between text-sm py-1.5 border-b border-border/50 last:border-0" data-testid={`admin-top-${id}`}>
                    <span className="truncate pr-2"><span className="text-muted-foreground">{p.brand} · </span>{p.name}</span>
                    <span className="tabular-nums font-semibold">{p.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      ) : null}

      {tab === "writeins" ? (
        <Section title="Popular write-ins">
          {popularReqs.length === 0 ? (
            <Empty text="No write-ins yet." />
          ) : (
            <div className="space-y-1.5">
              {popularReqs.map((r) => (
                <div key={r.text} className="flex justify-between items-center text-sm py-2 border-b border-border/50 last:border-0" data-testid={`admin-req-${r.text.slice(0, 20)}`}>
                  <span className="truncate pr-2">{r.text}</span>
                  <span className="tabular-nums font-semibold">{r.count}×</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {tab === "settings" && authed ? (
        <SettingsPanel
          settings={settings}
          onSave={(patch) => saveSettings.mutate(patch)}
          saving={saveSettings.isPending}
        />
      ) : tab === "settings" ? (
        <Empty text="Enter the admin PIN above to manage settings." />
      ) : null}

      {tab === "audit" && authed ? (
        <Section title="Audit log (recent activity)">
          {auditRows.length === 0 ? (
            <Empty text="No audit entries yet." />
          ) : (
            <div className="space-y-1">
              {auditRows.map((row) => {
                let detail: any = {};
                try {
                  detail = JSON.parse(row.detail);
                } catch {
                  /* ignore */
                }
                return (
                  <div
                    key={row.id}
                    className="text-xs py-2 border-b border-border/40 last:border-0 flex flex-col gap-0.5"
                    data-testid={`audit-row-${row.id}`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-foreground">{row.event}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {row.subjectId ? `subject ${row.subjectId} · ` : ""}
                      {Object.keys(detail).length > 0
                        ? JSON.stringify(detail)
                        : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      ) : tab === "audit" ? (
        <Empty text="Enter the admin PIN above to view the audit log." />
      ) : null}

      {tab === "vendors" && authed ? (
        <VendorsPanel pin={pin} vendors={vendors} locations={locations} />
      ) : tab === "vendors" ? (
        <Empty text="Enter the admin PIN above to manage vendors and locations." />
      ) : null}
    </Shell>
  );
}

async function adminRequest(pin: string, method: string, url: string, data?: unknown): Promise<Response> {
  const base = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
  const res = await fetch(base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-pin": pin,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res;
}

function ProductEditor({
  form,
  setForm,
  onSave,
  saving,
  error,
  vendors,
  locations,
}: {
  form: ProductForm;
  setForm: React.Dispatch<React.SetStateAction<ProductForm>>;
  onSave: () => void;
  saving: boolean;
  error?: string;
  vendors: Vendor[];
  locations: Location[];
}) {
  const set = (key: keyof ProductForm, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function onFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("imageUrl", String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  return (
    <section className="bg-card border border-card-border rounded-3xl p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold">{form.id ? "Edit product" : "Add product"}</h2>
          <p className="text-xs text-muted-foreground">Type the item exactly how customers ask for it in-store.</p>
        </div>
        {form.id ? (
          <Button variant="outline" size="sm" onClick={() => setForm(blankForm)} data-testid="button-new-product">
            New
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3">
        <Field label="Spoken order name" hint="Example: Geek Bar Pulse X Strawberry B-Pop 25K">
          <Input value={form.orderName} onChange={(e) => set("orderName", e.target.value)} data-testid="input-order-name" />
        </Field>
        <Field label="Display name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="input-product-name" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Brand">
            <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} data-testid="input-brand" />
          </Field>
          <Field label="Listed base price">
            <Input inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="24.99" data-testid="input-price" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Category">
            <select className="h-10 rounded-md bg-background border border-input px-3 text-sm" value={form.category} onChange={(e) => set("category", e.target.value)} data-testid="select-category">
              {CATEGORY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Subcategory">
            <Input value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder="Geek Bar, Bongs…" data-testid="input-subcategory" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Stock count" hint="Reaches 0 ⇒ unavailable on customer side">
            <Input
              inputMode="numeric"
              value={form.stockCount}
              onChange={(e) => set("stockCount", e.target.value)}
              data-testid="input-stock-count"
            />
          </Field>
          <Field label="Low-stock threshold">
            <Input
              inputMode="numeric"
              value={form.lowStockThreshold}
              onChange={(e) => set("lowStockThreshold", e.target.value)}
              data-testid="input-low-stock"
            />
          </Field>
        </div>
        <Field
          label="Approved substitute IDs (comma separated)"
          hint="Optional. Falls back to same-category matches when empty."
        >
          <Input
            value={form.substituteIds}
            onChange={(e) => set("substituteIds", e.target.value)}
            placeholder="lost-mary-mo5000, raz-dc25000"
            data-testid="input-substitutes"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Vendor">
            <select className="h-10 rounded-md bg-background border border-input px-3 text-sm" value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)} data-testid="select-vendor">
              {vendors.length === 0 ? <option value="default">PuffGo Default</option> : vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <select className="h-10 rounded-md bg-background border border-input px-3 text-sm" value={form.locationId} onChange={(e) => set("locationId", e.target.value)} data-testid="select-location">
              {locations.length === 0 ? <option value="default">Primary Store</option> : locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Details" hint="Vapes: flavor + puff count. Carts: strain + size.">
          <Input value={form.detail} onChange={(e) => set("detail", e.target.value)} placeholder="Flavor: Blue Razz · Puff count: 25K" data-testid="input-detail" />
        </Field>
        <Field label="Short note">
          <Textarea value={form.blurb} onChange={(e) => set("blurb", e.target.value)} placeholder="Say it: Geek Bar Pulse X, Blue Razz, 25K." data-testid="input-blurb" />
        </Field>
        <Field label="Image">
          <div className="flex gap-2 items-center">
            {form.imageUrl ? <img src={form.imageUrl} alt="Preview" className="size-16 rounded-xl bg-white object-contain p-1" /> : null}
            <div className="flex-1 space-y-2">
              <Input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="Paste image URL or upload below" data-testid="input-image-url" />
              <label className="h-10 rounded-md border border-input bg-background px-3 text-sm flex items-center justify-center gap-2 cursor-pointer hover-elevate">
                <ImagePlus className="size-4" />
                Upload photo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-image-file" />
              </label>
            </div>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Toggle checked={form.active} onClick={() => set("active", !form.active)} label="Visible in store" testid="toggle-active" />
          <Toggle checked={form.popular} onClick={() => set("popular", !form.popular)} label="Trending" testid="toggle-popular" />
        </div>
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
        <Button className="ember-button h-12 font-semibold" onClick={onSave} disabled={saving} data-testid="button-save-product">
          <Plus className="size-4 mr-2" />
          {saving ? "Saving…" : form.id ? "Save changes" : "Add product"}
        </Button>
      </div>
    </section>
  );
}

function SettingsPanel({
  settings,
  onSave,
  saving,
}: {
  settings:
    | {
        pricing: PricingSettings;
        orderRules: OrderSettings;
        notifications: NotificationSettings;
        compliance: ComplianceSettings;
        substitution: { priceDeltaThresholdCents: number };
      }
    | undefined;
  onSave: (patch: any) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);
  if (!draft) {
    return <Empty text="Loading settings…" />;
  }
  return (
    <div className="space-y-5">
      <Section title="Pricing">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <Field label="Mode" hint="Service fee adds on top of the listed price; revenue split records platform share without changing customer total.">
            <select
              className="h-10 rounded-md bg-background border border-input px-3 text-sm"
              value={draft.pricing.mode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  pricing: { ...draft.pricing, mode: e.target.value as any },
                })
              }
              data-testid="select-pricing-mode"
            >
              <option value="service_fee">Service / delivery fee</option>
              <option value="revenue_split">Revenue split (platform share)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Service fee flat ($)">
              <Input
                inputMode="decimal"
                value={(draft.pricing.serviceFeeFlatCents / 100).toFixed(2)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pricing: {
                      ...draft.pricing,
                      serviceFeeFlatCents: Math.round(
                        Number(e.target.value || 0) * 100,
                      ),
                    },
                  })
                }
                data-testid="input-fee-flat"
              />
            </Field>
            <Field label="Service fee %">
              <Input
                inputMode="decimal"
                value={String(draft.pricing.serviceFeePercent)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pricing: {
                      ...draft.pricing,
                      serviceFeePercent: Number(e.target.value || 0),
                    },
                  })
                }
                data-testid="input-fee-percent"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Revenue split %">
              <Input
                inputMode="decimal"
                value={String(draft.pricing.revenueSplitPercent)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pricing: {
                      ...draft.pricing,
                      revenueSplitPercent: Number(e.target.value || 0),
                    },
                  })
                }
                data-testid="input-rev-split"
              />
            </Field>
            <Field label="Customer markup %" hint="Visible markup on listed prices.">
              <Input
                inputMode="decimal"
                value={String(draft.pricing.markupPercent)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pricing: {
                      ...draft.pricing,
                      markupPercent: Number(e.target.value || 0),
                    },
                  })
                }
                data-testid="input-markup"
              />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Supplier-cost data is never exposed on the customer side — pricing
            is computed entirely from listed price, markup, and the configured
            fee mode.
          </p>
        </div>
      </Section>

      <Section title="Order automation">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <Field label="Acknowledgement timeout (minutes)" hint="Set 0 to disable auto-flag.">
            <Input
              inputMode="numeric"
              value={String(draft.orderRules.ackTimeoutMinutes)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  orderRules: {
                    ...draft.orderRules,
                    ackTimeoutMinutes: Math.max(0, Math.round(Number(e.target.value || 0))),
                  },
                })
              }
              data-testid="input-ack-timeout"
            />
          </Field>
          <Field label="Action when timeout fires">
            <select
              className="h-10 rounded-md bg-background border border-input px-3 text-sm"
              value={draft.orderRules.ackTimeoutAction}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  orderRules: {
                    ...draft.orderRules,
                    ackTimeoutAction: e.target.value as any,
                  },
                })
              }
              data-testid="select-ack-action"
            >
              <option value="flag">Flag (status: attention_needed)</option>
              <option value="cancel">Cancel order automatically</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Notifications">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <Field label="Operator phone (SMS)" hint="Provider must be configured via PUFFCO_SMS_PROVIDER and credentials env vars before real SMS is sent.">
            <Input
              value={draft.notifications.operatorPhone}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  notifications: { ...draft.notifications, operatorPhone: e.target.value },
                })
              }
              placeholder="+1 555 555 5555"
              data-testid="input-op-phone"
            />
          </Field>
          <Field label="Push webhook URL" hint="Optional. Posts a JSON payload on every alert (Slack/Discord/etc.).">
            <Input
              value={draft.notifications.webhookUrl}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  notifications: { ...draft.notifications, webhookUrl: e.target.value },
                })
              }
              placeholder="https://hooks.slack.com/…"
              data-testid="input-webhook"
            />
          </Field>
          <Toggle
            checked={draft.notifications.soundEnabled}
            onClick={() =>
              setDraft({
                ...draft,
                notifications: {
                  ...draft.notifications,
                  soundEnabled: !draft.notifications.soundEnabled,
                },
              })
            }
            label="In-app sound on new orders"
            testid="toggle-sound"
          />
        </div>
      </Section>

      <Section title="Substitution">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <Field label="Max price difference for auto-suggested substitutes ($)">
            <Input
              inputMode="decimal"
              value={(draft.substitution.priceDeltaThresholdCents / 100).toFixed(2)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  substitution: {
                    ...draft.substitution,
                    priceDeltaThresholdCents: Math.round(Number(e.target.value || 0) * 100),
                  },
                })
              }
              data-testid="input-sub-threshold"
            />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            Operator-approved substitutes (set per-product) bypass this
            threshold so an explicit "swap to X" choice always wins.
          </p>
        </div>
      </Section>

      <Section title="Compliance copy">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
          <Field label="Age-gate text">
            <Textarea
              value={draft.compliance.ageGateText}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  compliance: { ...draft.compliance, ageGateText: e.target.value },
                })
              }
              data-testid="input-agegate-text"
            />
          </Field>
          <Field label="ID-verify text">
            <Textarea
              value={draft.compliance.idVerifyText}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  compliance: { ...draft.compliance, idVerifyText: e.target.value },
                })
              }
              data-testid="input-idverify-text"
            />
          </Field>
          <Field label="Legal disclaimer (cautious — not legal advice)">
            <Textarea
              value={draft.compliance.legalDisclaimer}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  compliance: { ...draft.compliance, legalDisclaimer: e.target.value },
                })
              }
              data-testid="input-disclaimer"
            />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            All compliance text is operator-supplied. PuffGo prototype does not
            provide legal advice; verify your local, state, and federal rules
            before launch.
          </p>
        </div>
      </Section>

      <Button
        className="ember-button h-12 font-semibold w-full"
        disabled={saving}
        onClick={() =>
          onSave({
            pricing: draft.pricing,
            orderRules: draft.orderRules,
            notifications: draft.notifications,
            compliance: draft.compliance,
            substitution: draft.substitution,
          })
        }
        data-testid="button-save-settings"
      >
        <SettingsIcon className="size-4 mr-2" />
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}

function VendorsPanel({
  pin,
  vendors,
  locations,
}: {
  pin: string;
  vendors: Vendor[];
  locations: Location[];
}) {
  const [vForm, setVForm] = useState({ id: "", name: "", contact: "" });
  const [lForm, setLForm] = useState({ id: "", name: "", address: "" });
  const addVendor = useMutation({
    mutationFn: async () => {
      await adminRequest(pin, "POST", "/api/admin/vendors", vForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      setVForm({ id: "", name: "", contact: "" });
    },
  });
  const addLocation = useMutation({
    mutationFn: async () => {
      await adminRequest(pin, "POST", "/api/admin/locations", lForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/locations"] });
      setLForm({ id: "", name: "", address: "" });
    },
  });

  return (
    <div className="space-y-5">
      <Section title="Vendors">
        <p className="text-xs text-muted-foreground mb-2">
          Today the store is single-vendor. The "default" vendor seeds
          automatically. Add more vendors when expanding to a multi-vendor
          marketplace — products can be reassigned in the editor.
        </p>
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-2 mb-3">
          {vendors.map((v) => (
            <div key={v.id} className="flex justify-between text-sm py-1">
              <span className="font-mono text-xs">{v.id}</span>
              <span className="font-semibold">{v.name}</span>
            </div>
          ))}
        </div>
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="vendor-id" value={vForm.id} onChange={(e) => setVForm({ ...vForm, id: e.target.value })} data-testid="input-vendor-id" />
            <Input placeholder="Name" value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} data-testid="input-vendor-name" />
            <Input placeholder="Contact" value={vForm.contact} onChange={(e) => setVForm({ ...vForm, contact: e.target.value })} data-testid="input-vendor-contact" />
          </div>
          <Button
            onClick={() => addVendor.mutate()}
            disabled={addVendor.isPending || !vForm.id || !vForm.name}
            data-testid="button-add-vendor"
          >
            <Building2 className="size-4 mr-2" /> Add vendor
          </Button>
        </div>
      </Section>

      <Section title="Locations">
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-2 mb-3">
          {locations.map((l) => (
            <div key={l.id} className="flex justify-between text-sm py-1">
              <span className="font-mono text-xs">{l.id}</span>
              <span className="font-semibold">{l.name}</span>
            </div>
          ))}
        </div>
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="location-id" value={lForm.id} onChange={(e) => setLForm({ ...lForm, id: e.target.value })} data-testid="input-location-id" />
            <Input placeholder="Name" value={lForm.name} onChange={(e) => setLForm({ ...lForm, name: e.target.value })} data-testid="input-location-name" />
            <Input placeholder="Address" value={lForm.address} onChange={(e) => setLForm({ ...lForm, address: e.target.value })} data-testid="input-location-address" />
          </div>
          <Button
            onClick={() => addLocation.mutate()}
            disabled={addLocation.isPending || !lForm.id || !lForm.name}
            data-testid="button-add-location"
          >
            <Building2 className="size-4 mr-2" /> Add location
          </Button>
        </div>
      </Section>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-full text-sm font-semibold border shrink-0 inline-flex items-center ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-card-border text-foreground"}`}>
      {children}
    </button>
  );
}

function Toggle({ checked, onClick, label, testid }: { checked: boolean; onClick: () => void; label: string; testid: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${checked ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input text-muted-foreground"}`} data-testid={testid}>
      {label}: {checked ? "Yes" : "No"}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  testid,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "warning" | "negative";
  testid?: string;
}) {
  const iconClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "warning"
      ? "text-amber-500"
      : tone === "negative"
      ? "text-destructive"
      : "text-primary";
  return (
    <div className="glass-card rounded-xl p-3" data-testid={testid}>
      <Icon className={`size-4 mb-1.5 ${iconClass}`} />
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {sub ? (
        <div className="text-[10px] text-muted-foreground/80 mt-0.5 tabular-nums">{sub}</div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="glass-card rounded-xl p-5 text-center text-sm text-muted-foreground">{text}</div>;
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_payment: {
      label: "Unpaid",
      cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    },
    paid: {
      label: "Paid",
      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    },
    refund_due: {
      label: "Refund due",
      cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40",
    },
    refunded: {
      label: "Refunded",
      cls: "bg-slate-500/15 text-slate-300 border-slate-500/40",
    },
    canceled: {
      label: "Canceled",
      cls: "bg-red-500/15 text-red-300 border-red-500/40",
    },
  };
  const m = map[status] ?? map.pending_payment;
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${m.cls}`}
      data-testid={`badge-payment-${status}`}
    >
      {m.label}
    </span>
  );
}
