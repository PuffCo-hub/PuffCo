import { Shell, StickyFooter } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Order, OrderItem } from "@shared/schema";
import { formatPrice } from "@/lib/catalog";
import { useToast } from "@/hooks/use-toast";

const CHECKLIST = [
  { id: "verify-id", label: "Verified 21+ government-issued ID" },
  { id: "match-name", label: "ID name matches order recipient" },
  { id: "check-items", label: "All items accounted for, sealed" },
  { id: "collected-tip", label: "Tip already paid via app (no cash needed)" },
  { id: "child-resistant", label: "Child-resistant packaging intact" },
  { id: "no-impaired", label: "Recipient appears unimpaired" },
];

export default function Driver() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    refetchInterval: 5000,
  });

  const active = orders.find((o) =>
    ["pay_pending", "confirmed", "en_route"].includes(o.status)
  );

  const advance = useMutation({
    mutationFn: async (status: string) => {
      if (!active) return;
      await apiRequest("POST", `/api/orders/${active.id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });

  const allChecked = CHECKLIST.every((c) => checks[c.id]);

  const items: OrderItem[] = active ? JSON.parse(active.items) : [];

  return (
    <Shell title="Driver console" back="/menu" showCart={false}>
      {!active ? (
        <div className="glass-card rounded-xl p-8 text-center mt-8">
          <h2 className="font-semibold mb-1">No active deliveries</h2>
          <p className="text-sm text-muted-foreground">
            Waiting for an order to come in…
          </p>
        </div>
      ) : (
        <>
          <div className="glass-card rounded-2xl p-4 mb-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Order #{active.id} · {active.status}
            </p>
            <h2 className="text-base font-semibold mt-1" data-testid="text-driver-address">
              {active.street}
              {active.unit ? `, ${active.unit}` : ""}
            </h2>
            <p className="text-sm text-muted-foreground">
              {active.city}, {active.state} {active.zip}
            </p>
            {active.notes && (
              <p className="text-xs text-muted-foreground mt-2">
                Note: {active.notes}
              </p>
            )}
            <div className="mt-3 text-lg font-bold tabular-nums text-primary">
              {formatPrice(active.totalCents)}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-semibold mb-2">Items</h3>
            <ul className="space-y-1 text-sm">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex justify-between"
                  data-testid={`driver-item-${it.id}`}
                >
                  <span className="truncate pr-2">
                    <span className="text-muted-foreground">{it.qty}× </span>
                    {it.brand} — {it.name}
                  </span>
                  <span className="tabular-nums shrink-0">
                    {formatPrice(it.estPriceCents * it.qty)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-semibold mb-3">Handoff checklist</h3>
            <ul className="space-y-3">
              {CHECKLIST.map((c) => (
                <li key={c.id} className="flex items-start gap-3">
                  <Checkbox
                    id={c.id}
                    checked={!!checks[c.id]}
                    onCheckedChange={(v) =>
                      setChecks((cur) => ({ ...cur, [c.id]: !!v }))
                    }
                    data-testid={`check-${c.id}`}
                  />
                  <label htmlFor={c.id} className="text-sm leading-tight">
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-6">
            {active.status !== "en_route" && (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => advance.mutate("en_route")}
                data-testid="button-set-enroute"
              >
                Mark en route
              </Button>
            )}
            {active.status === "en_route" && (
              <Button
                variant="outline"
                className="h-11 col-span-2"
                onClick={() => advance.mutate("confirmed")}
                data-testid="button-revert-confirmed"
              >
                Back to confirmed
              </Button>
            )}
          </div>

          <StickyFooter>
            <Button
              disabled={!allChecked || advance.isPending}
              onClick={() => {
                advance.mutate("delivered", {
                  onSuccess: () =>
                    toast({
                      title: "Handoff complete",
                      description: `Order #${active.id} delivered`,
                    }),
                });
              }}
              className="ember-button w-full h-12 font-semibold"
              data-testid="button-complete-handoff"
            >
              {allChecked ? "Complete handoff" : "Complete checklist to proceed"}
            </Button>
          </StickyFooter>
        </>
      )}
    </Shell>
  );
}
