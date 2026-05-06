import { useLocation } from "wouter";
import { useCart } from "@/lib/cart-context";
import { SmokeWordmark } from "@/components/SmokeWordmark";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export default function AgeGate() {
  const [, navigate] = useLocation();
  const { setAgeVerified } = useCart();

  return (
    <div className="mobile-shell smoke-overlay relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="mb-6">
          <SmokeWordmark size={68} />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Smoke shop · QR delivery
        </p>
        <h1 className="text-xl font-semibold mb-3" data-testid="text-age-title">
          Are you 21 or older?
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground mb-8">
          By continuing you confirm you are of legal age in your jurisdiction.
          A valid government-issued ID is required at handoff.
        </p>

        <div className="w-full space-y-3 max-w-xs">
          <Button
            className="ember-button w-full h-12 text-base font-semibold"
            data-testid="button-age-yes"
            onClick={() => {
              setAgeVerified(true);
              navigate("/menu");
            }}
          >
            <ShieldCheck className="size-4 mr-2" />
            Yes, I'm 21+
          </Button>
          <Button
            variant="ghost"
            className="w-full h-12 text-sm text-muted-foreground"
            data-testid="button-age-no"
            onClick={() => {
              window.location.href = "https://www.google.com";
            }}
          >
            No, take me away
          </Button>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground max-w-xs mt-8">
        Prototype concept only. PuffCo does not store ID images, dates of
        birth, payment data, or persistent customer profiles. This is not
        legal or compliance advice.
      </p>
    </div>
  );
}
