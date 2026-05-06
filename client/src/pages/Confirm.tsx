import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, IdCard, MapPin, Truck, Phone } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import type { Order } from "@shared/schema";
import { SUPPORT_PHONE } from "@/lib/config";

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
      <div className="glass-card rounded-2xl p-5 mb-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Order #{lastOrderId}
        </p>
        <h2 className="text-lg font-semibold">Thanks for your order</h2>
        <p className="text-sm text-muted-foreground mt-1">
          We'll dispatch a driver as soon as your Cash App payment shows up.
        </p>
        <div className="mt-3 text-2xl font-bold tabular-nums text-primary">
          {order ? formatPrice(order.totalCents) : "—"}
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
