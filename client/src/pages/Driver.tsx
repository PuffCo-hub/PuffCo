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
type DriverInfo = {
  id: string;
  name: string;
  phone: string;
  driverCode?: string;
  username?: string;
};
type DriverSession = { driver: DriverInfo; authMode?: "pin" | "password" };
type DriverAuth =
  | { mode: "pin"; pin: string }
  | { mode: "password"; username: string; password: string };

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function authHeaders(auth: DriverAuth): Record<string, string> {
  if (auth.mode === "password") {
    return {
      "x-driver-username": auth.username,
      "x-driver-password": auth.password,
    };
  }
  return { "x-driver-pin": auth.pin };
}

async function driverRequest(
  auth: DriverAuth,
  method: string,
  url: string,
  body?: unknown,
) {
  const res = await fetch(API_BASE + url, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders(auth) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

async function publicJson(method: string, url: string, body?: unknown) {
  const res = await fetch(API_BASE + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const message =
      (data && (data.error?.formErrors?.[0] ||
        data.error?.fieldErrors && Object.values(data.error.fieldErrors).flat()[0] ||
        (typeof data.error === "string" ? data.error : null))) ||
      text ||
      res.statusText;
    throw new Error(String(message));
  }
  return data;
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

function mapsUrlFor(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function dropoffAddress(d: DriverOrder["dropoff"]): string {
  const line1 = d.unit ? `${d.street}, Unit ${d.unit}` : d.street;
  return [line1, d.city, d.state, d.zip].filter(Boolean).join(", ").trim();
}

type Screen = "landing" | "login" | "signup";

export default function Driver() {
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>("landing");
  // login state
  const [loginMode, setLoginMode] = useState<"password" | "pin">("password");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [authError, setAuthError] = useState("");
  // signup state
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupPending, setSignupPending] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  // session
  const [auth, setAuth] = useState<DriverAuth | null>(null);
  const [session, setSession] = useState<DriverSession | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [available, setAvailable] = useState<DriverOrder[]>([]);
  const [active, setActive] = useState<DriverOrder[]>([]);
  const lastAvailableIds = useRef<Set<number>>(new Set());

  async function login() {
    setAuthError("");
    try {
      if (loginMode === "password") {
        const username = loginUsername.trim();
        if (!username || !loginPassword) {
          setAuthError("Username and password required.");
          return;
        }
        const data: DriverSession = await publicJson("POST", "/api/driver/login", {
          username,
          password: loginPassword,
        });
        setAuth({ mode: "password", username, password: loginPassword });
        setSession(data);
      } else {
        const pin = loginPin.trim();
        if (!pin) {
          setAuthError("Access code required.");
          return;
        }
        const data: DriverSession = await publicJson("POST", "/api/driver/login", { pin });
        setAuth({ mode: "pin", pin });
        setSession(data);
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("invalid")) {
        setAuthError(
          loginMode === "password"
            ? "Invalid username or password."
            : "Invalid driver access code.",
        );
      } else {
        setAuthError(msg || "Login failed.");
      }
    }
  }

  async function signup() {
    setSignupError("");
    const username = signupUsername.trim();
    if (!username || username.length < 3) {
      setSignupError("Username must be at least 3 characters.");
      return;
    }
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
      setSignupError("Username may only contain letters, numbers, dot, underscore, or dash.");
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError("Password must be at least 6 characters.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setSignupError("Passwords do not match.");
      return;
    }
    setSignupPending(true);
    try {
      const data = await publicJson("POST", "/api/driver/signup", {
        username,
        password: signupPassword,
      });
      const code = data?.driver?.driverCode || "";
      setIssuedCode(code);
      // Auto-login so the driver lands on the load board right away.
      const loginData: DriverSession = await publicJson("POST", "/api/driver/login", {
        username,
        password: signupPassword,
      });
      setAuth({ mode: "password", username, password: signupPassword });
      setSession(loginData);
      toast({
        title: "Driver account created",
        description: code ? `Your driver ID is ${code}` : "Welcome aboard.",
      });
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("taken")) {
        setSignupError("That username is already taken. Try another.");
      } else {
        setSignupError(msg || "Signup failed.");
      }
    } finally {
      setSignupPending(false);
    }
  }

  async function refresh() {
    if (!session || !auth) return;
    try {
      const [av, ac] = await Promise.all([
        driverRequest(auth, "GET", "/api/driver/orders/available"),
        driverRequest(auth, "GET", "/api/driver/orders/active"),
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
        setAuth(null);
        setScreen("login");
        setAuthError("Session expired. Sign in again.");
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
    if (!auth) return;
    try {
      await driverRequest(auth, "POST", `/api/driver/orders/${orderId}/claim`);
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
    if (!auth) return;
    try {
      await driverRequest(auth, "PATCH", `/api/driver/orders/${orderId}/status`, {
        driverStatus: status,
      });
      await refresh();
    } catch {
      toast({ title: "Could not update", description: "Try again." });
    }
  }

  // ----- Unauthenticated screens -----
  if (!session) {
    if (screen === "landing") {
      return (
        <Shell title="Driver portal" back="/menu" showCart={false}>
          <div className="bg-card border border-card-border rounded-3xl p-5 mb-4">
            <h2 className="text-lg font-semibold mb-1">Welcome, driver</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Choose how you'd like to continue.
            </p>
            <Button
              className="ember-button w-full mb-3 h-12"
              onClick={() => {
                setScreen("login");
                setAuthError("");
              }}
              data-testid="button-driver-existing"
            >
              Existing driver — open load board
            </Button>
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => {
                setScreen("signup");
                setSignupError("");
                setIssuedCode(null);
              }}
              data-testid="button-driver-new"
            >
              New driver? Sign up
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            New drivers get a unique driver ID (PGDP###) on signup.
          </p>
        </Shell>
      );
    }

    if (screen === "signup") {
      return (
        <Shell title="New driver signup" back="/menu" showCart={false}>
          <div className="bg-card border border-card-border rounded-3xl p-5 mb-4">
            <h2 className="text-lg font-semibold mb-1">Create your driver account</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Pick a username and password. We'll issue your driver ID automatically.
            </p>
            <label className="block text-xs font-medium mb-1">Username</label>
            <Input
              value={signupUsername}
              onChange={(e) => {
                setSignupUsername(e.target.value);
                setSignupError("");
              }}
              placeholder="e.g. alex_t"
              autoComplete="username"
              className="mb-3"
              data-testid="input-signup-username"
            />
            <label className="block text-xs font-medium mb-1">Password</label>
            <Input
              value={signupPassword}
              onChange={(e) => {
                setSignupPassword(e.target.value);
                setSignupError("");
              }}
              placeholder="At least 6 characters"
              type="password"
              autoComplete="new-password"
              className="mb-3"
              data-testid="input-signup-password"
            />
            <label className="block text-xs font-medium mb-1">Confirm password</label>
            <Input
              value={signupConfirm}
              onChange={(e) => {
                setSignupConfirm(e.target.value);
                setSignupError("");
              }}
              placeholder="Re-enter password"
              type="password"
              autoComplete="new-password"
              className="mb-3"
              onKeyDown={(e) => { if (e.key === "Enter") signup(); }}
              data-testid="input-signup-confirm"
            />
            <Button
              className="ember-button w-full mb-2"
              onClick={signup}
              disabled={signupPending}
              data-testid="button-signup-submit"
            >
              {signupPending ? "Creating…" : "Create driver account"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setScreen("landing");
                setSignupError("");
              }}
              data-testid="button-signup-back"
            >
              Back
            </Button>
            {signupError ? (
              <div className="text-xs text-destructive mt-3" data-testid="text-signup-error">
                {signupError}
              </div>
            ) : null}
            {issuedCode ? (
              <div
                className="text-xs text-emerald-600 dark:text-emerald-400 mt-3"
                data-testid="text-issued-driver-code"
              >
                Your driver ID: <span className="font-mono font-semibold">{issuedCode}</span>
              </div>
            ) : null}
          </div>
        </Shell>
      );
    }

    // login screen
    return (
      <Shell title="Driver sign in" back="/menu" showCart={false}>
        <div className="bg-card border border-card-border rounded-3xl p-5 mb-4">
          <h2 className="text-lg font-semibold mb-1">Driver sign in</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Use your driver username and password, or the access code issued by admin.
          </p>
          <div className="flex gap-2 mb-3">
            <Button
              size="sm"
              variant={loginMode === "password" ? "default" : "outline"}
              onClick={() => {
                setLoginMode("password");
                setAuthError("");
              }}
              data-testid="button-login-mode-password"
            >
              Username
            </Button>
            <Button
              size="sm"
              variant={loginMode === "pin" ? "default" : "outline"}
              onClick={() => {
                setLoginMode("pin");
                setAuthError("");
              }}
              data-testid="button-login-mode-pin"
            >
              Access code
            </Button>
          </div>
          {loginMode === "password" ? (
            <>
              <Input
                value={loginUsername}
                onChange={(e) => {
                  setLoginUsername(e.target.value);
                  setAuthError("");
                }}
                placeholder="Username"
                autoComplete="username"
                className="mb-2"
                data-testid="input-login-username"
              />
              <Input
                value={loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value);
                  setAuthError("");
                }}
                placeholder="Password"
                type="password"
                autoComplete="current-password"
                className="mb-3"
                onKeyDown={(e) => { if (e.key === "Enter") login(); }}
                data-testid="input-login-password"
              />
            </>
          ) : (
            <Input
              value={loginPin}
              onChange={(e) => {
                setLoginPin(e.target.value);
                setAuthError("");
              }}
              placeholder="Driver access code"
              type="password"
              className="mb-3"
              onKeyDown={(e) => { if (e.key === "Enter") login(); }}
              data-testid="input-driver-pin"
            />
          )}
          <Button
            className="ember-button w-full mb-2"
            onClick={login}
            data-testid="button-driver-login"
          >
            Open load board
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setScreen("landing");
              setAuthError("");
            }}
            data-testid="button-login-back"
          >
            Back
          </Button>
          {authError ? (
            <div className="text-xs text-destructive mt-3" data-testid="text-login-error">{authError}</div>
          ) : null}
        </div>
      </Shell>
    );
  }

  // ----- Authenticated load board -----
  const headerName = session.driver.driverCode
    ? `${session.driver.name} · ${session.driver.driverCode}`
    : session.driver.name;
  return (
    <Shell title={`Driver · ${headerName}`} back="/menu" showCart={false}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="text-xs text-muted-foreground">Open order load board · auto-refreshing every 10s</div>
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

      <Section title={`Open orders — available to claim (${available.length})`}>
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
      {order.pickup.address ? (
        <a
          href={mapsUrlFor(order.pickup.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 mb-2 hover:bg-amber-500/20"
          data-testid={`link-driver-nav-pickup-${order.id}`}
        >
          Navigate to pickup
        </a>
      ) : (
        <div className="text-[11px] text-muted-foreground mb-2" data-testid={`text-driver-nav-pickup-unavailable-${order.id}`}>
          Pickup address unavailable
        </div>
      )}
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
      {order.dropoff.street ? (
        <a
          href={mapsUrlFor(dropoffAddress(order.dropoff))}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-2 hover:bg-emerald-500/20"
          data-testid={`link-driver-nav-dropoff-${order.id}`}
        >
          Navigate to delivery
        </a>
      ) : (
        <div className="text-[11px] text-muted-foreground mb-2" data-testid={`text-driver-nav-dropoff-unavailable-${order.id}`}>
          Delivery address unavailable
        </div>
      )}
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
