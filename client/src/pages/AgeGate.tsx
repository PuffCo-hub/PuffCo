import { useLocation } from "wouter";
import { useCart } from "@/lib/cart-context";
import { SmokeWordmark } from "@/components/SmokeWordmark";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Truck, Clock, Sparkles, AlertTriangle } from "lucide-react";
import neonDeliveryBg from "@/assets/brand/neon-delivery-bg.jpeg";
import { InstallHelp } from "@/components/InstallHelp";

export default function AgeGate() {
  const [, navigate] = useLocation();
  const { setAgeVerified } = useCart();

  return (
    <div className="mobile-shell safe-top relative flex min-h-[100dvh] flex-col px-6 pb-8 text-center overflow-hidden">
      {/* Neon delivery visual with smoke overlays. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <img
          src={neonDeliveryBg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_center] opacity-[0.88] animate-[slow-pan_18s_ease-in-out_infinite_alternate]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/12 via-background/38 to-background/72" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(145_80%_45%/0.18),transparent_55%),radial-gradient(120%_80%_at_50%_110%,hsl(145_60%_35%/0.16),transparent_60%)]" />
        <div className="absolute -top-32 -left-16 size-[420px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-32 -right-12 size-[380px] rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 size-[320px] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div
          role="alert"
          className="w-full max-w-sm rounded-2xl border-2 border-red-500/70 bg-red-600/20 px-4 py-4 text-left shadow-lg ring-1 ring-red-500/30"
          data-testid="banner-prelaunch-agegate"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-5 shrink-0 text-red-300" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-red-200 font-bold">
                Pre-launch · Notice
              </div>
              <div className="mt-1 text-base font-extrabold leading-tight text-red-50">
                Do not place orders yet.
              </div>
              <p className="mt-1.5 text-[13px] leading-snug text-red-50/95">
                PuffGo will be fully functional on{" "}
                <span className="font-bold underline decoration-red-300/70">07/04/2026</span>.
                Orders placed before that date will not be fulfilled.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 mb-1 flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-[10px] uppercase tracking-[0.22em] text-primary font-semibold">
          <Sparkles className="size-3" />
          Pasco County only
        </div>

        <div className="mt-6 mb-3">
          <SmokeWordmark size={84} />
        </div>

        <h1
          className="text-[2.1rem] leading-[1.05] font-bold tracking-tight max-w-sm"
          data-testid="text-age-title"
        >
          Smoke shop delivery,
          <br />
          <span className="text-primary">right to your door.</span>
        </h1>

        <p className="mt-4 max-w-xs text-sm text-muted-foreground leading-relaxed">
          Browse popular vapes, carts, glass, papers, and wraps. Pay with Cash App, include
          your order code, and have your ID ready at handoff.
        </p>

        <div className="mt-4 max-w-xs rounded-2xl border border-amber-400/35 bg-amber-400/12 px-4 py-3 text-left text-xs leading-relaxed text-amber-100/90">
          <span className="font-semibold text-amber-200">Delivery area:</span>{" "}
          PuffGo is serving Pasco County only right now. Outside Pasco may be accepted only
          if the tip makes the longer drive worth it.
        </div>

        {/* Trust strip */}
        <div className="mt-6 grid grid-cols-3 gap-2 w-full max-w-xs">
          <Trust icon={<Truck className="size-4" />} label="Pasco only" />
          <Trust icon={<Clock className="size-4" />} label="Live tracking" />
          <Trust icon={<ShieldCheck className="size-4" />} label="21+ ID at door" />
        </div>

        <div className="w-full space-y-3 max-w-xs mt-8">
          <Button
            className="ember-button w-full h-14 text-base font-semibold rounded-2xl"
            data-testid="button-age-yes"
            onClick={() => {
              setAgeVerified(true);
              navigate("/menu");
            }}
          >
            <ShieldCheck className="size-4 mr-2" />
            I'm 21+ · Preview menu
          </Button>
          <p className="text-[11px] leading-snug text-red-200/90 text-center">
            Preview only — ordering opens 07/04/2026.
          </p>
          <button
            type="button"
            className="block w-full text-xs text-muted-foreground hover:text-foreground transition py-2"
            data-testid="button-age-no"
            onClick={() => {
              window.location.href = "https://www.google.com";
            }}
          >
            I'm under 21 — take me away
          </button>
          <div className="pt-1 flex items-center justify-center">
            <InstallHelp triggerLabel="How to install PuffGo on your phone" />
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/80 max-w-xs mx-auto mt-8">
        PuffGo does not store ID images, dates of birth, payment data, or persistent
        customer profiles. Availability and delivery are subject to local rules and the
        current Pasco County service area.
      </p>
    </div>
  );
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card/60 backdrop-blur-sm px-2 py-3 flex flex-col items-center gap-1.5 text-[11px] text-foreground/85 leading-tight">
      <span className="text-primary">{icon}</span>
      <span className="text-center">{label}</span>
    </div>
  );
}
