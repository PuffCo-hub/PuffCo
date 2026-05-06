import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { useCart } from "@/lib/cart-context";
import { applyMarkup, formatPrice, type Product } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ProductImage } from "@/components/ProductImage";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SubstitutionDialog } from "@/components/SubstitutionDialog";

export default function Cart() {
  const { lines, setQty, removeItem, replaceItem, subtotalCents } = useCart();
  const [, navigate] = useLocation();
  const [substitutingId, setSubstitutingId] = useState<string | null>(null);

  // Live availability — the server already disables out-of-stock cards on the
  // menu, but a customer could have added something seconds before another
  // customer cleared the last unit. We refetch every few seconds while on the
  // cart screen so unavailable items become obvious.
  const { data: catalog = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    refetchInterval: 5000,
  });

  const linesWithStatus = useMemo(() => {
    return lines.map((l) => {
      const fresh = catalog.find((p) => p.id === l.product.id);
      const available = fresh ? fresh.available && fresh.stockCount >= l.qty : true;
      return { ...l, available, fresh };
    });
  }, [lines, catalog]);

  const unavailableLines = linesWithStatus.filter((l) => !l.available);

  function startCheckout() {
    if (unavailableLines.length > 0) {
      // Force user to handle the first unavailable item first.
      setSubstitutingId(unavailableLines[0].product.id);
      return;
    }
    navigate("/address");
  }

  return (
    <Shell title="Your cart" back="/menu" showCart={false}>
      {lines.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center mt-12">
          <h2 className="font-semibold mb-1">Cart's empty</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Pick something from the menu or submit a write-in.
          </p>
          <Link href="/menu">
            <Button className="ember-button" data-testid="button-empty-shop">
              Browse menu
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {unavailableLines.length > 0 ? (
            <div
              className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 mb-3 flex items-start gap-2"
              data-testid="banner-unavailable"
            >
              <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-xs leading-snug">
                <span className="font-semibold text-destructive">
                  {unavailableLines.length}{" "}
                  {unavailableLines.length === 1 ? "item is" : "items are"} unavailable.
                </span>{" "}
                Pick a substitute or remove before checkout.
              </div>
            </div>
          ) : null}

          <div className="space-y-2 mb-5">
            {linesWithStatus.map((l) => {
              const est = applyMarkup(l.product.basePriceCents);
              return (
                <div
                  key={l.product.id}
                  className={`glass-card rounded-xl p-3 flex gap-3 items-center ${
                    !l.available ? "ring-1 ring-destructive/40" : ""
                  }`}
                  data-testid={`line-${l.product.id}`}
                >
                  <ProductImage product={l.product} compact />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {l.product.brand}
                    </div>
                    <div className="text-sm font-semibold truncate">
                      {l.product.orderName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {l.product.detail}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums flex items-center gap-1.5 flex-wrap">
                      <span>{formatPrice(est)} ea · est.</span>
                      {!l.available ? (
                        <button
                          onClick={() => setSubstitutingId(l.product.id)}
                          className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold"
                          data-testid={`button-substitute-${l.product.id}`}
                        >
                          Out of stock — find substitute
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 bg-card border border-card-border rounded-full px-1">
                      <button
                        className="size-7 flex items-center justify-center text-muted-foreground hover-elevate rounded-full"
                        onClick={() => setQty(l.product.id, l.qty - 1)}
                        data-testid={`button-dec-${l.product.id}`}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span
                        className="min-w-[1.25rem] text-center text-sm tabular-nums"
                        data-testid={`text-qty-${l.product.id}`}
                      >
                        {l.qty}
                      </span>
                      <button
                        className="size-7 flex items-center justify-center text-muted-foreground hover-elevate rounded-full"
                        onClick={() => setQty(l.product.id, l.qty + 1)}
                        data-testid={`button-inc-${l.product.id}`}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(l.product.id)}
                      className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                      data-testid={`button-remove-${l.product.id}`}
                    >
                      <Trash2 className="size-3" /> Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="glass-card rounded-xl p-4 mb-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated subtotal</span>
              <span
                className="font-semibold tabular-nums"
                data-testid="text-subtotal"
              >
                {formatPrice(subtotalCents)}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Includes the configured service markup. Final total may include a
              service or delivery fee set in store settings, plus tip.
            </div>
          </div>

          <Disclaimer />

          <StickyFooter>
            <Button
              className="ember-button w-full h-12 font-semibold"
              onClick={startCheckout}
              data-testid="button-checkout"
            >
              {unavailableLines.length > 0
                ? "Resolve unavailable items"
                : `Continue · ${formatPrice(subtotalCents)}`}
            </Button>
          </StickyFooter>
        </>
      )}

      {substitutingId ? (
        <SubstitutionDialog
          productId={substitutingId}
          onAccept={(replacement) => {
            replaceItem(substitutingId, replacement);
            setSubstitutingId(null);
          }}
          onDecline={() => {
            removeItem(substitutingId);
            setSubstitutingId(null);
          }}
        />
      ) : null}
    </Shell>
  );
}
