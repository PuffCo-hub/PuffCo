import { Shell } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

type DriverOrderItem = { id: string; name: string; brand: string; qty: number };
type DriverOrder = {
  id: number;
  orderCode: string;
  createdAt: number;
  items: DriverOrderItem[];
  pickup: { shopName: string; address: string; phone: string };
  dropoff: {
    firstName: string;
    lastInitial: string;
    phone: string;
    street: string;
    unit: string | null;
    city: string;
    state: string;
    zip: string;
  };
  notes: string;
  shopStatus: string;
  driverStatus: string;
  paymentStatus: string;
};
type DriverSession = { driver: { id: string; name: string; phone: string } };

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function driverRequest(pin: string, method: string, url: string, body?: unknown) {
  const res = await fetch(API_BASE + url, {
    method,
    headers: { "Content-Type": "application/json", "x-driver-pin": pin },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    /* ignore */
  }
}

const DRIVER_FLOW: Array<{ key: string; label: string }> = [
  { key: "accepted", label: "Accepted" },
  { key: "en_route_pickup", label: "En route to pickup" },
  { key: "picked_up", label: "Picked up" },
  { key: "delivered", label: "Delivered" },
];

function nextDriverStatus(cur: string): string | null {
  const idx = DRIVER_FLOW.findIndex((s) => s.key === cur);
  if (idx < 0) return "accepted";
  if (idx >= DRIVER_FLOW.length - 1) return null;
  return DRIVER_FLOW[idx + 1].key;
}

export default function Driver() {
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<DriverSession | null>(null);
  const [authError, setAuthError] = useState("");
  const [soundOn, setSoundOn] = useState(false);
  const [available, setAvailable] = useState<DriverOrder[]>([]);
  const [active, setActive] = useState<DriverOrder[]>([]);
  const lastAvailableIds = useRef<Set<number>>(new Set());

  async function login() {
    setAuthError("");
    try {
      const data: DriverSession = await driverRequest(pin, "POST", "/api/driver/login", { pin });
      setSession(data);
    } catch {
      setAuthError("Invalid driver access code.");
    }
  }

  async function refresh() {
    if (!session) return;
    try {
      const [av, ac] = await Promise.all([
        driverRequest(pin, "GET", "/api/driver/orders/available"),
        driverRequest(pin, "GET", "/api/driver/orders/active"),
      ]);
      const incomingIds = new Set<number>((av as DriverOrder[]).map((o) => o.id));
      const previously = lastAvailableIds.current;
      const trueNew = (av as DriverOrder[]).filter((o) => !previously.has(o.id));
      if (trueNew.length > 0 && previously.size > 0) {
        if (soundOn) playBeep();
        toast({
          title: `New delivery available`,
          description: `${trueNew[0].orderCode} · ${trueNew[0].dropoff.city}`,
        });
      }
      lastAvailableIds.current = incomingIds;
      setAvailable(av);
      setActive(ac);
    } catch (err: any) {
      if (String(err?.message || "").includes("401")) {
        setSession(null);
        setAuthError("Session expired. Re-enter the access code.");
      }
    }
  }

  useEffect(() => {
    if (!session) return;
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, soundOn]);

  async function claim(orderId: number) {
    try {
      await driverRequest(pin, "POST", `/api/driver/orders/${orderId}/claim`);
      toast({ title: "Order claimed" });
      await refresh();
    } catch (err: any) {
      toast({
        title: "Could not claim",
        description: String(err?.message || "").includes("409")
          ? "Another driver got there first."
          : "Try again.",
      });
      await refresh();
    }
  }

  async function setStatus(orderId: number, status: string) {
    try {
      await driverRequest(pin, "PATCH", `/api/driver/orders/${orderId}/status`, {
        driverStatus: status,
      });
      await refresh();
    } catch {
      toast({ title: "Could not update", description: "Try again." });
    }
  }

  if (!session) {
    return (
      <Shell title="Driver portal" back="/menu" showCart={false}>
        <div className="bg-card border border-card-border rounded-3xl p-5 mb-5">
          <h2 className="text-lg font-semibold mb-1">Driver access</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter the driver access code issued by PuffGo admin.
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
            placeholder="Driver access code"
            type="password"
            className="mb-3"
            data-testid="input-driver-pin"
          />
          <Button className="ember-button w-full mb-3" onClick={login} data-testid="button-driver-login">
            Unlock driver
          </Button>
          {authError ? <div className="text-xs text-destructive mb-2">{authError}</div> : null}
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={`Driver · ${session.driver.name}`} back="/menu" showCart={false}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">Auto-refreshing every 10s</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            if (next) playBeep();
          }}
          data-testid="button-driver-sound"
        >
          {soundOn ? "Sound: on" : "Sound: off"}
        </Button>
      </div>

      <Section title={`Active deliveries (${active.length})`}>
        {active.length === 0 ? (
          <Empty text="No active deliveries." />
        ) : (
          active.map((o) => <ActiveCard key={o.id} order={o} onSetStatus={setStatus} />)
        )}
      </Section>

      <Section title={`Available to claim (${available.length})`}>
        {available.length === 0 ? (
          <Empty text="No deliveries waiting." />
        ) : (
          available.map((o) => <AvailableCard key={o.id} order={o} onClaim={claim} />)
        )}
      </Section>
    </Shell>
  );
}

function AvailableCard({
  order,
  onClaim,
}: {
  order: DriverOrder;
  onClaim: (id: number) => void;
}) {
  return (
    <div
      className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 mb-2"
      data-testid={`driver-available-${order.id}`}
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <div>
          <div className="font-semibold">{order.orderCode}</div>
          <div className="text-[11px] text-muted-foreground">
            {new Date(order.createdAt).toLocaleTimeString()} · Shop:{" "}
            <span className="uppercase tracking-wide">{order.shopStatus.replace("_", " ")}</span>
          </div>
        </div>
      </div>
      <div className="text-xs mb-1">
        <span className="text-muted-foreground">Pickup: </span>
        {order.pickup.shopName}
        {order.pickup.address ? ` — ${order.pickup.address}` : ""}
      </div>
      <div className="text-xs mb-2">
        <span className="text-muted-foreground">Drop-off: </span>
        {order.dropoff.city}, {order.dropoff.state} {order.dropoff.zip}
      </div>
      <Button
        size="sm"
        className="ember-button w-full"
        onClick={() => onClaim(order.id)}
        data-testid={`button-driver-claim-${order.id}`}
      >
        Accept this delivery
      </Button>
    </div>
  );
}

function ActiveCard({
  order,
  onSetStatus,
}: {
  order: DriverOrder;
  onSetStatus: (id: number, status: string) => void;
}) {
  const next = nextDriverStatus(order.driverStatus);
  const nextLabel = DRIVER_FLOW.find((s) => s.key === next)?.label;
  const itemsLine = order.items
    .map((it) => `${it.qty}× ${it.brand ? `${it.brand} ` : ""}${it.name}`)
    .join(", ");
  return (
    <div
      className="rounded-2xl border border-card-border bg-card p-3 mb-2"
      data-testid={`driver-active-${order.id}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold">{order.orderCode}</div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
            {order.driverStatus.replace("_", " ")}
          </div>
        </div>
      </div>
      <div className="text-xs mb-1">
        <span className="text-muted-foreground">Pickup: </span>
        {order.pickup.shopName}
      </div>
      {order.pickup.address ? (
        <div className="text-xs mb-1 text-muted-foreground">{order.pickup.address}</div>
      ) : null}
      <div className="text-xs mb-2">
        <span className="text-muted-foreground">For: </span>
        {order.dropoff.firstName} {order.dropoff.lastInitial}. · {order.dropoff.phone}
      </div>
      <div className="text-xs mb-2">
        <span className="text-muted-foreground">Deliver to: </span>
        {order.dropoff.street}
        {order.dropoff.unit ? `, Unit ${order.dropoff.unit}` : ""},{" "}
        {order.dropoff.city}, {order.dropoff.state} {order.dropoff.zip}
      </div>
      <div className="text-xs mb-2 text-muted-foreground">Items: {itemsLine}</div>
      {order.notes ? (
        <div className="text-[11px] text-muted-foreground mb-2">Note: {order.notes}</div>
      ) : null}
      <div className="flex gap-2 flex-wrap">
        {next ? (
          <Button
            size="sm"
            className="ember-button"
            onClick={() => onSetStatus(order.id, next)}
            data-testid={`button-driver-next-${order.id}`}
          >
            Mark {nextLabel}
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Completed.</span>
        )}
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
