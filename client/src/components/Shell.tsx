import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ShoppingBag } from "lucide-react";
import { SmokeWordmark } from "./SmokeWordmark";
import { useCart } from "@/lib/cart-context";
import neonDeliveryBg from "@/assets/brand/neon-delivery-bg.jpeg";

type Props = {
  children: ReactNode;
  title?: string;
  back?: string;
  showCart?: boolean;
};

export function Shell({ children, title, back, showCart = true }: Props) {
  const [, navigate] = useLocation();
  const { lines } = useCart();
  const cartCount = lines.reduce((s, l) => s + l.qty, 0);
  return (
    <div className="mobile-shell smoke-overlay relative flex flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-1/2 z-0 w-full max-w-[440px] -translate-x-1/2 overflow-hidden"
      >
        <img
          src={neonDeliveryBg}
          alt=""
          className="h-full w-full object-cover object-[center_center] opacity-[0.78] animate-[slow-pan_22s_ease-in-out_infinite_alternate]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/35 to-background/62" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_20%,transparent,hsl(var(--background)/0.32)_78%)]" />
      </div>
      <header className="app-header sticky top-0 z-30 backdrop-blur-md bg-background/82 border-b border-border">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 min-h-[56px]">
          <div className="flex items-center gap-2 min-w-0">
            {back ? (
              <button
                onClick={() => navigate(back)}
                className="rounded-full p-2.5 hover-elevate -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Back"
                data-testid="button-back"
              >
                <ChevronLeft className="size-6" />
              </button>
            ) : (
              <Link href="/menu" data-testid="link-home-logo">
                <span className="block py-1">
                  <SmokeWordmark size={44} />
                </span>
              </Link>
            )}
            {title ? (
              <h1
                className="font-semibold tracking-tight text-lg truncate"
                data-testid="text-page-title"
              >
                {title}
              </h1>
            ) : null}
          </div>
          {showCart && (
            <button
              onClick={() => navigate("/cart")}
              className="relative rounded-full p-2.5 hover-elevate min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Open cart"
              data-testid="button-open-cart"
            >
              <ShoppingBag className="size-6" />
              {cartCount > 0 && (
                <span
                  className="absolute top-0 right-0 min-w-[20px] h-[20px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center ring-2 ring-background"
                  data-testid="badge-cart-count"
                >
                  {cartCount}
                </span>
              )}
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 relative z-10 px-4 pb-28 pt-4">{children}</main>
    </div>
  );
}

export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] z-40 px-4 pb-4 pt-3 bg-gradient-to-t from-background via-background/95 to-background/0">
      {children}
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      21+ only. Valid government-issued ID required at handoff. Availability,
      delivery, and payment are subject to local rules. PuffGo is currently
      Pasco County only unless the operator accepts the longer trip.
    </p>
  );
}
