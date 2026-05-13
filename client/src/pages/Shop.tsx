import { Shell } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/catalog";

type ShopOrderItem = { id: string; name: string; brand: string; qty: number };
type ShopOrder = {
  id: number;
  orderCode: string;
  createdAt: number;
  items: ShopOrderItem[];
  notes: string;
  shopStatus: string;
  driverStatus: string;
  paymentStatus: string;
  shopPayoutCents: number;
};
type ShopSession = { shop: { id: string; name: string; address: string; contactPhone: string } };

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function shopRequest(pin: string, method: string, url: string, body?: unknown) {
  const res = await fetch(API_BASE + url, {
    method,
    headers: { "Content-Type": "application/json", "x-shop-pin": pin },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    /* ignore — autoplay restrictions */
  }
}

const SHOP_STATUS_FLOW: Array<{ key: string; label: string }> = [
  { key: "received", label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready_for_pickup", label: "Ready for pickup" },
];

export default function Shop() {
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<ShopSession | null>(null);
  const [authError, setAuthError] = useState("");
  const [soundOn, setSoundOn] = useState(false);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const lastSeenIds = useRef<Set<number>>(new Set());

  async function login() {
    setAuthError("");
    try {
      const data: ShopSession = await shopRequest(pin, "POST", "/api/shop/login", { pin });
      setSession(data);
    } catch {
      setAuthError("Invalid shop access code.");
    }
  }

  async function refresh() {
    if (!session) return;
    try {
      setLoading(true);
      const rows: ShopOrder[] = await shopRequest(pin, "GET", "/api/shop/orders");
      const incomingIds = new Set(rows.map((o) => o.id));
      // Detect new actionable orders for the alert.
      const isNew = (o: ShopOrder) =>
        o.paymentStatus === "paid" &&
        ["new", "received"].includes(o.shopStatus);
      const previouslyKnown = lastSeenIds.current;
      const truelyNew = rows.filter((o) => isNew(o) && !previouslyKnown.has(o.id));
      if (truelyNew.length > 0 && previouslyKnown.size > 0) {
        if (soundOn) playBeep();
        toast({
          title: `New order ${truelyNew[0].orderCode}`,
          description: `${truelyNew[0].items.reduce((s, i) => s + i.qty, 0)} item(s) to prep`,
        });
      }
      lastSeenIds.current = incomingIds;
      setOrders(rows);
    } catch (err: any) {
      // Re-auth if PIN got rotated mid-session.
      if (String(err?.message || "").includes("401")) {
        setSession(null);
        setAuthError("Session expired. Re-enter the access code.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    refresh();
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, soundOn]);

  async function setStatus(orderId: number, nextStatus: string) {
    try {
      await shopRequest(pin, "PATCH", `/api/shop/orders/${orderId}/status`, {
        shopStatus: nextStatus,
      });
      await refresh();
    } catch {
      toast({ title: "Could not update status", description: "Try again." });
    }
  }

  if (!session) {
    return (
      <Shell title="Shop portal" back="/menu" showCart={false}>
        <div className="bg-card border border-card-border rounded-3xl p-5 mb-5">
          <h2 className="text-lg font-semibold mb-1">Shop access</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter the shop access code to view the day's orders. Your code is
            issued by the PuffGo admin.
          </p>
          <Input
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setAuthError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") login();
            }}
            placeholder="Shop access code"
            type="password"
            className="mb-3"
            data-testid="input-shop-pin"
          />
          <Button className="ember-button w-full mb-3" onClick={login} data-testid="button-shop-login">
            Unlock shop
          </Button>
          {authError ? (
            <div className="text-xs text-destructive mb-2">{authError}</div>
          ) : null}
        </div>
      </Shell>
    );
  }

  const actionable = orders.filter(
    (o) =>
      o.paymentStatus === "paid" &&
      ["new", "received", "preparing"].includes(o.shopStatus),
  );
  const ready = orders.filter((o) => o.shopStatus === "ready_for_pickup" && o.driverStatus !== "delivered");
  const done = orders.filter((o) => o.driverStatus === "delivered").slice(0, 10);

  return (
    <Shell title={`Shop · ${session.shop.name}`} back="/menu" showCart={false}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">
          Auto-refreshing every 12s {loading ? "…" : ""}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            if (next) playBeep();
          }}
          data-testid="button-shop-sound"
        >
          {soundOn ? "Sound: on" : "Sound: off"}
        </Button>
      </div>

      <Section title={`Active (${actionable.length})`}>
        {actionable.length === 0 ? (
          <Empty text="No active orders." />
        ) : (
          actionable.map((o) => (
            <OrderCard key={o.id} order={o} onSetStatus={setStatus} highlight={o.shopStatus === "new"} />
          ))
        )}
      </Section>

      <Section title={`Ready for pickup (${ready.length})`}>
        {ready.length === 0 ? (
          <Empty text="Nothing waiting on a driver right now." />
        ) : (
          ready.map((o) => (
            <OrderCard key={o.id} order={o} onSetStatus={setStatus} highlight={false} />
          ))
        )}
      </Section>

      {done.length > 0 ? (
        <Section title="Recently delivered">
          {done.map((o) => (
            <div
              key={o.id}
              className="bg-card border border-card-border rounded-2xl p-3 mb-2 text-xs text-muted-foreground"
            >
              {o.orderCode} · {o.items.reduce((s, i) => s + i.qty, 0)} items · delivered
            </div>
          ))}
        </Section>
      ) : null}
    </Shell>
  );
}

function OrderCard({
  order,
  onSetStatus,
  highlight,
}: {
  order: ShopOrder;
  onSetStatus: (id: number, next: string) => void;
  highlight: boolean;
}) {
  const nextStep = (() => {
    if (order.shopStatus === "new") return "received";
    if (order.shopStatus === "received") return "preparing";
    if (order.shopStatus === "preparing") return "ready_for_pickup";
    return null;
  })();
  const nextLabel = SHOP_STATUS_FLOW.find((s) => s.key === nextStep)?.label;
  return (
    <div
      className={`rounded-2xl border p-3 mb-2 ${
        highlight
          ? "border-amber-500/60 bg-amber-500/10 animate-pulse"
          : "border-card-border bg-card"
      }`}
      data-testid={`shop-order-${order.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold">{order.orderCode}</div>
          <div className="text-[11px] text-muted-foreground">
            {new Date(order.createdAt).toLocaleTimeString()} ·{" "}
            <span className="uppercase tracking-wide">{order.shopStatus.replace("_", " ")}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">Shop payout</div>
          <div className="font-semibold tabular-nums">{formatPrice(order.shopPayoutCents)}</div>
        </div>
      </div>
      <ul className="space-y-1 text-sm mb-2">
        {order.items.map((it, i) => (
          <li key={`${it.id}-${i}`} className="flex justify-between">
            <span className="truncate pr-2">
              <span className="text-muted-foreground">{it.qty}× </span>
              {it.brand ? `${it.brand} — ` : ""}
              {it.name}
            </span>
          </li>
        ))}
      </ul>
      {order.notes ? (
        <div className="text-[11px] text-muted-foreground mb-2">Note: {order.notes}</div>
      ) : null}
      {order.paymentStatus !== "paid" ? (
        <div className="text-[11px] text-amber-500 mb-2">
          Waiting for payment confirmation — admin will mark paid before prep.
        </div>
      ) : null}
      <div className="flex gap-2 flex-wrap">
        {nextStep && order.paymentStatus === "paid" ? (
          <Button
            size="sm"
            className="ember-button"
            onClick={() => onSetStatus(order.id, nextStep)}
            data-testid={`button-shop-next-${order.id}`}
          >
            Mark {nextLabel}
          </Button>
        ) : null}
        {order.shopStatus !== "new" && order.paymentStatus === "paid" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSetStatus(order.id, "new")}
            data-testid={`button-shop-reset-${order.id}`}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-card-border p-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
