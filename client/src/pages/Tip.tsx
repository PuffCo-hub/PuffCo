import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/lib/cart-context";
import { applyMarkup, formatPrice } from "@/lib/catalog";
import { useLocation } from "wouter";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PRESETS = [
  { label: "$0", cents: 0 },
  { label: "$3", cents: 300 },
  { label: "$5", cents: 500 },
  { label: "$8", cents: 800 },
  { label: "$12", cents: 1200 },
];

export default function Tip() {
  const {
    lines,
    address,
    subtotalCents,
    tipCents,
    setTipCents,
    setLastOrderId,
  } = useCart();
  const [, navigate] = useLocation();
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const total = subtotalCents + tipCents;

  async function placeOrder() {
    if (!address || lines.length === 0) {
      navigate("/cart");
      return;
    }
    setSubmitting(true);
    try {
      const items = lines.map((l) => ({
        id: l.product.id,
        name: l.product.orderName,
        brand: l.product.brand,
        qty: l.qty,
        basePriceCents: l.product.basePriceCents,
        estPriceCents: applyMarkup(l.product.basePriceCents),
      }));
      const res = await apiRequest("POST", "/api/orders", {
        items: JSON.stringify(items),
        subtotal: subtotalCents,
        tipCents,
        totalCents: total,
        street: address.street,
        unit: address.unit ?? null,
        city: address.city,
        state: address.state.toUpperCase(),
        zip: address.zip,
        notes: address.notes ?? null,
      });
      const order = await res.json();
      setLastOrderId(order.id);
      navigate("/pay");
    } catch (e) {
      toast({
        title: "Couldn't place order",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell title="Tip your driver" back="/address" showCart={false}>
      <p className="text-sm text-muted-foreground mb-5">
        Tips go to the driver. Optional, always appreciated.
      </p>

      <div className="grid grid-cols-5 gap-2 mb-3">
        {PRESETS.map((p) => {
          const active = tipCents === p.cents && custom === "";
          return (
            <button
              key={p.label}
              onClick={() => {
                setCustom("");
                setTipCents(p.cents);
              }}
              className={`h-12 rounded-lg border text-sm font-semibold transition ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-card-border hover-elevate"
              }`}
              data-testid={`button-tip-${p.cents}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="glass-card rounded-xl p-3 mb-6">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Custom amount
        </label>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-muted-foreground">$</span>
          <Input
            value={custom}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              setCustom(v);
              const num = Number(v);
              setTipCents(Number.isFinite(num) ? Math.round(num * 100) : 0);
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="bg-transparent border-0 focus-visible:ring-0 px-0 h-8 tabular-nums"
            data-testid="input-tip-custom"
          />
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-2 mb-5">
        <Row label="Subtotal (est.)" value={formatPrice(subtotalCents)} />
        <Row label="Tip" value={formatPrice(tipCents)} testid="text-tip" />
        <div className="smoke-divider my-2" />
        <Row
          label="Estimated total"
          value={formatPrice(total)}
          bold
          testid="text-estimated-total"
        />
      </div>

      <Disclaimer />

      <StickyFooter>
        <Button
          onClick={placeOrder}
          disabled={submitting}
          className="ember-button w-full h-12 font-semibold"
          data-testid="button-place-order"
        >
          {submitting ? "Placing…" : `Place order · ${formatPrice(total)}`}
        </Button>
      </StickyFooter>
    </Shell>
  );
}

function Row({
  label,
  value,
  bold,
  testid,
}: {
  label: string;
  value: string;
  bold?: boolean;
  testid?: string;
}) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "text-base" : ""}`}>
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${bold ? "font-semibold" : ""}`}
        data-testid={testid}
      >
        {value}
      </span>
    </div>
  );
}
