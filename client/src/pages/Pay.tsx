import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/catalog";
import { CASHTAG } from "@/lib/config";
import { Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function Pay() {
  const { totalCents, lastOrderId } = useCart();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const cashAppUrl = `https://cash.app/${CASHTAG}/${(totalCents / 100).toFixed(
    2
  )}`;

  function copyTag() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(CASHTAG);
      toast({ title: "Cashtag copied", description: CASHTAG });
    }
  }

  async function markSent() {
    if (lastOrderId == null) {
      navigate("/confirm");
      return;
    }
    try {
      await apiRequest("POST", `/api/orders/${lastOrderId}/cashtag-sent`, {});
      navigate("/confirm");
    } catch {
      navigate("/confirm");
    }
  }

  return (
    <Shell title="Send payment" back="/tip" showCart={false}>
      <div className="glass-card rounded-2xl p-6 text-center mb-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Cash App only
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          Send this estimated total to
        </p>
        <div
          className="text-2xl font-bold mb-2"
          data-testid="text-cashtag"
        >
          {CASHTAG}
        </div>
        <div
          className="text-3xl font-bold tabular-nums text-primary mb-4"
          data-testid="text-pay-total"
        >
          {formatPrice(totalCents)}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={copyTag}
            className="h-11"
            data-testid="button-copy-tag"
          >
            <Copy className="size-4 mr-2" />
            Copy {CASHTAG}
          </Button>
          <a
            href={cashAppUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="link-cashapp"
          >
            <Button className="ember-button h-11 w-full">
              <ExternalLink className="size-4 mr-2" />
              Open Cash App
            </Button>
          </a>
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 mb-5">
        <h3 className="font-semibold text-sm mb-2">How payment works</h3>
        <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
          <li>Tap "Open Cash App" or copy the cashtag.</li>
          <li>
            Send <span className="font-mono">{formatPrice(totalCents)}</span> to{" "}
            <span className="font-mono">{CASHTAG}</span>.
          </li>
          <li>Tap "I sent it" below — driver will be dispatched.</li>
          <li>Show valid 21+ ID at handoff.</li>
        </ol>
        <p className="text-[11px] text-muted-foreground mt-3">
          PuffCo does not process payment and does not store your payment
          information. Cash App is a third-party service — its use is not a
          claim of compliance with any particular regulatory requirement.
        </p>
      </div>

      <Disclaimer />

      <StickyFooter>
        <Button
          onClick={markSent}
          className="ember-button w-full h-12 font-semibold"
          data-testid="button-mark-sent"
        >
          I sent it
        </Button>
      </StickyFooter>
    </Shell>
  );
}
