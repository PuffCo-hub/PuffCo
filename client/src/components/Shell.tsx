import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ShoppingBag } from "lucide-react";
import { SmokeWordmark } from "./SmokeWordmark";
import { useCart } from "@/lib/cart-context";

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
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {back ? (
              <button
                onClick={() => navigate(back)}
                className="rounded-full p-2 hover-elevate -ml-2"
                aria-label="Back"
                data-testid="button-back"
              >
                <ChevronLeft className="size-5" />
              </button>
            ) : (
              <Link href="/menu" data-testid="link-home-logo">
                <span className="block">
                  <SmokeWordmark size={36} />
                </span>
              </Link>
            )}
            {title ? (
              <h1
                className="font-semibold tracking-tight text-base truncate"
                data-testid="text-page-title"
              >
                {title}
              </h1>
            ) : null}
          </div>
          {showCart && (
            <Link href="/cart">
              <button
                className="relative rounded-full p-2 hover-elevate"
                aria-label="Open cart"
                data-testid="button-open-cart"
              >
                <ShoppingBag className="size-5" />
                {cartCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
                    data-testid="badge-cart-count"
                  >
                    {cartCount}
                  </span>
                )}
              </button>
            </Link>
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
      21+ only. Valid government-issued ID required at handoff. PuffCo is a
      prototype concept and not legal or compliance advice.
    </p>
  );
}
