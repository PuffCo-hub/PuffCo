import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Check, ShoppingBag } from "lucide-react";
import { useLocation } from "wouter";
import { ProductImage } from "./ProductImage";
import { useCart } from "@/lib/cart-context";
import { applyMarkup, formatPrice, type Product } from "@/lib/catalog";

type Props = {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Pull a couple of structured facts out of the free-form `detail` string the
// admin enters. We keep the original string visible too — this is just so the
// detail sheet can surface "Flavor" / "Strain" / "Puffs" pills like a normal
// shopping app would.
function extractFacts(detail: string): { label: string; value: string }[] {
  if (!detail) return [];
  const facts: { label: string; value: string }[] = [];
  const parts = detail.split(/[·•|]/);
  for (const raw of parts) {
    const m = raw.trim().match(/^([A-Za-z][A-Za-z ]+)\s*[:\-]\s*(.+)$/);
    if (m) {
      facts.push({ label: m[1].trim(), value: m[2].trim() });
    }
  }
  return facts;
}

export function ProductDetailModal({ product, open, onOpenChange }: Props) {
  const { addItem, lines } = useCart();
  const [, navigate] = useLocation();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset local state whenever a new product is opened.
  useEffect(() => {
    if (open) {
      setQty(1);
      setJustAdded(false);
      setBusy(false);
    }
  }, [open, product?.id]);

  if (!product) return null;

  const est = applyMarkup(product.basePriceCents);
  const inCart = lines.find((l) => l.product.id === product.id)?.qty ?? 0;
  const facts = extractFacts(product.detail);
  const unavailable = !product.available;

  function handleAdd() {
    if (!product || unavailable || busy) return;
    setBusy(true);
    addItem(product, qty);
    setJustAdded(true);
    // Keep the button disabled briefly so a second tap doesn't double-add.
    window.setTimeout(() => setBusy(false), 700);
    window.setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden gap-0 sm:rounded-2xl"
        data-testid="modal-product-detail"
      >
        <DialogTitle className="sr-only">{product.name}</DialogTitle>
        <DialogDescription className="sr-only">
          {product.blurb || product.detail}
        </DialogDescription>

        {/* Hero image */}
        <div
          className="relative aspect-square w-full bg-white"
          style={{
            background: `radial-gradient(circle at 50% 35%, ${product.accent}33, transparent 65%), white`,
          }}
        >
          <div className="absolute inset-0 p-6">
            <ProductImage product={product} size="large" className="rounded-2xl border-none" />
          </div>
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-black/70 text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              {product.brand}
            </span>
            <span className="rounded-full bg-black/55 text-white/90 px-2 py-0.5 text-[10px] font-medium">
              {product.subcategory}
            </span>
          </div>
          {unavailable ? (
            <span
              className="absolute right-3 top-3 rounded-full bg-destructive text-destructive-foreground px-2.5 py-1 text-[11px] font-semibold"
              data-testid="badge-modal-oos"
            >
              Out of stock
            </span>
          ) : product.lowStock ? (
            <span
              className="absolute right-3 top-3 rounded-full bg-amber-500 text-black px-2.5 py-1 text-[11px] font-semibold"
              data-testid="badge-modal-low"
            >
              Only {product.stockCount} left
            </span>
          ) : (
            <span className="absolute right-3 top-3 rounded-full bg-green-500/90 text-black px-2.5 py-1 text-[11px] font-semibold">
              In stock
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-5">
          <h2
            className="text-lg font-semibold leading-tight"
            data-testid="text-modal-name"
          >
            {product.name}
          </h2>
          {product.blurb ? (
            <p className="text-sm text-muted-foreground mt-1">{product.blurb}</p>
          ) : null}

          {facts.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {facts.map((f) => (
                <div
                  key={f.label}
                  className="rounded-xl border border-border bg-card px-3 py-2"
                  data-testid={`fact-${f.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {f.label}
                  </div>
                  <div className="text-sm font-medium leading-tight mt-0.5">
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          ) : product.detail ? (
            <p className="text-sm text-foreground/85 mt-3">{product.detail}</p>
          ) : null}

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Estimated total
              </div>
              <div
                className="text-2xl font-semibold tabular-nums"
                data-testid="text-modal-price"
              >
                {formatPrice(est)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Includes platform markup. Final total shown at checkout.
              </div>
            </div>
            {!unavailable ? (
              <div
                className="flex items-center gap-1 rounded-full border border-border bg-card p-1"
                data-testid="qty-stepper"
              >
                <button
                  type="button"
                  className="size-8 rounded-full hover-elevate flex items-center justify-center disabled:opacity-40"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                  data-testid="button-qty-down"
                >
                  <Minus className="size-4" />
                </button>
                <span
                  className="w-7 text-center text-sm font-semibold tabular-nums"
                  data-testid="text-qty"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  className="size-8 rounded-full hover-elevate flex items-center justify-center disabled:opacity-40"
                  onClick={() =>
                    setQty((q) =>
                      Math.min(q + 1, Math.max(1, product.stockCount - inCart))
                    )
                  }
                  disabled={qty + inCart >= product.stockCount}
                  aria-label="Increase quantity"
                  data-testid="button-qty-up"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button
              className="ember-button h-12 w-full text-base"
              onClick={handleAdd}
              disabled={unavailable || busy}
              data-testid="button-modal-add"
            >
              {justAdded ? (
                <>
                  <Check className="size-5 mr-1" /> Added to cart
                </>
              ) : unavailable ? (
                "Out of stock"
              ) : (
                <>
                  Add {qty} to cart · {formatPrice(est * qty)}
                </>
              )}
            </Button>
            {inCart > 0 ? (
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/cart");
                }}
                data-testid="button-modal-view-cart"
              >
                <ShoppingBag className="size-4 mr-2" />
                View cart ({inCart} of this in cart)
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
