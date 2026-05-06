import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { applyMarkup, formatPrice } from "@/lib/catalog";
import { apiRequest } from "@/lib/queryClient";
import type { Product } from "@/lib/catalog";
import { ArrowRight, X } from "lucide-react";

type Suggestion = Product & {
  reason: "approved" | "same_subcategory" | "same_category";
  priceDeltaCents: number;
};

type Props = {
  productId: string;
  onAccept: (replacement: Product) => void;
  onDecline: () => void;
};

// Lightweight inline modal — no portal needed; the cart page mounts it inside
// the existing layout. Customers see it when an item in their cart is no
// longer available at checkout. They can pick a substitute or decline; if
// they decline, the calling code removes the item.
export function SubstitutionDialog({ productId, onAccept, onDecline }: Props) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [target, setTarget] = useState<Product | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiRequest("POST", "/api/substitutes", { productId });
        const data = await res.json();
        if (!active) return;
        setSuggestions(data.suggestions || []);
        setTarget(data.target || null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [productId]);

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      data-testid="dialog-substitute"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-card border border-card-border rounded-3xl w-full max-w-[420px] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold">
              Out of stock
            </p>
            <h2 className="text-base font-semibold mt-1 truncate">
              {target?.orderName || "Item unavailable"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Pick an approved alternative or remove it from your cart.
            </p>
          </div>
          <button
            onClick={onDecline}
            className="rounded-full p-2 hover-elevate -mr-2"
            aria-label="Close"
            data-testid="button-substitute-close"
          >
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            Looking for substitutes…
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            No approved substitutes available right now.
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex gap-3 items-center bg-background/60 rounded-2xl p-3 border border-border/40"
                data-testid={`substitute-option-${s.id}`}
              >
                <img
                  src={s.imageUrl}
                  alt={s.name}
                  className="size-12 rounded-xl bg-white object-contain p-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.brand} · {s.reason === "approved" ? "Operator-approved" : "Same category"}
                  </div>
                  <div className="text-sm font-semibold truncate">{s.orderName}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {formatPrice(applyMarkup(s.basePriceCents))}
                    {s.priceDeltaCents !== 0 ? (
                      <span className={s.priceDeltaCents > 0 ? "text-amber-500 ml-1" : "text-emerald-500 ml-1"}>
                        ({s.priceDeltaCents > 0 ? "+" : ""}
                        {formatPrice(Math.abs(s.priceDeltaCents))})
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="ember-button h-9"
                  onClick={() => onAccept(s)}
                  data-testid={`button-accept-substitute-${s.id}`}
                >
                  Swap <ArrowRight className="size-3.5 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onDecline}
            data-testid="button-substitute-decline"
          >
            Remove item
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
          Removing the item triggers a refund path on any payment already sent.
          Operators reconcile refunds via Cash App outside of this app.
        </p>
      </div>
    </div>
  );
}
