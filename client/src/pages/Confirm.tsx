import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, IdCard, MapPin, Truck, Phone } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import type { Order } from "@shared/schema";
import { SUPPORT_PHONE } from "@/lib/config";

function PaymentBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_payment: {
      label: "Awaiting payment",
      cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    },
    paid: {
      label: "Payment received",
      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    },
    refund_due: {
      label: "Refund due",
      cls: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    },
    refunded: {
      label: "Refunded",
      cls: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    },
    canceled: {
      label: "Canceled",
      cls: "bg-destructive/15 text-destructive border-destructive/30",
    },
  };
  const v = map[status || "pending_payment"] ?? map.pending_payment;
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${v.cls}`}
      data-testid="badge-payment-status"
    >
      {v.label}
    </span>
  );
}

const STATUS_STEPS: { key: Order["status"]; label: string; icon: any }[] = [
  { key: "placed", label: "Order placed", icon: CheckCircle2 },
  { key: "pay_pending", label: "Payment received", icon: CheckCircle2 },
  { key: "confirmed", label: "Driver assigned", icon: Truck },
  { key: "en_route", label: "En route", icon: MapPin },
  { key: "delivered", label: "Delivered", icon: IdCard },
];

export default function Confirm() {
  const { lastOrderId, clearCart } = useCart();
  const [, navigate] = useLocation();

  const { data: order } = useQuery<Order>({
    queryKey: ["/api/orders", lastOrderId],
    enabled: lastOrderId != null,
    refetchInterval: 4000,
  });

  if (lastOrderId == null) {
    return (
      <Shell title="Order status" back="/menu" showCart={false}>
        <div className="glass-card rounded-xl p-8 text-center mt-8">
          <h2 className="font-semibold mb-1">No active order</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Place an order to track it here.
          </p>
          <Button
            className="ember-button"
            onClick={() => navigate("/menu")}
            data-testid="button-go-menu"
          >
            Browse menu
          </Button>
        </div>
      </Shell>
    );
  }

  const currentIdx = STATUS_STEPS.findIndex(
    (s) => s.key === (order?.status ?? "pay_pending")
  );

  return (
    <Shell title="Order status" back="/menu" showCart={false}>
      <div className="rounded-2xl border border-card-border bg-card p-5 mb-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Your order code
        </p>
        <div
          className="mt-1 text-3xl font-bold tracking-wider text-primary font-mono"
          data-testid="text-order-code"
        >
          {order?.orderCode || `PG-${String(lastOrderId).padStart(4, "0")}`}
        </div>
        <h2 className="text-lg font-semibold mt-3">Thanks for your order</h2>
        <p className="text-sm text-muted-foreground mt-1">
          We'll dispatch a driver as soon as your Cash App payment is confirmed.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Estimated total
            </div>
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {order ? formatPrice(order.totalCents) : "—"}
            </div>
          </div>
          <PaymentBadge status={order?.paymentStatus} />
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Progress</h3>
        <ol className="space-y-3">
          {STATUS_STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i <= currentIdx;
            return (
              <li
                key={s.key}
                className="flex items-center gap-3"
                data-testid={`step-${s.key}`}
              >
                <div
                  className={`size-8 rounded-full grid place-items-center ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <span
                  className={`text-sm ${
                    done ? "font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="glass-card rounded-2xl p-4 mb-4">
        <h3 className="text-sm font-semibold mb-1">At handoff</h3>
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>Have valid 21+ government-issued ID ready.</li>
          <li>Driver verifies ID at the door before completing handoff.</li>
          <li>Tip already included if added at checkout.</li>
        </ul>
      </div>

      <div className="glass-card rounded-2xl p-4 mb-6">
        <h3 className="text-sm font-semibold mb-2">Need help?</h3>
        <a
          href={`tel:${SUPPORT_PHONE.replace(/[^\d]/g, "")}`}
          className="flex items-center gap-2 text-sm text-primary"
          data-testid="link-support-call"
        >
          <Phone className="size-4" />
          {SUPPORT_PHONE}
        </a>
      </div>

      <Disclaimer />

      <StickyFooter>
        <Button
          variant="outline"
          className="w-full h-12"
          onClick={() => {
            clearCart();
            navigate("/menu");
          }}
          data-testid="button-new-order"
        >
          New order
        </Button>
      </StickyFooter>
    </Shell>
  );
}
