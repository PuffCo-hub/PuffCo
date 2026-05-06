import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/catalog";
import { CASHTAG } from "@/lib/config";
import { Copy, ExternalLink, Check, Hash, DollarSign, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { Order } from "@shared/schema";
import { useState } from "react";

export default function Pay() {
  const { totalCents, lastOrderId } = useCart();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState<"tag" | "code" | "amount" | null>(null);

  // Once the order is placed we have a server-issued PC-NNNN code; show it
  // immediately so the customer can paste it into their Cash App note.
  const { data: order } = useQuery<Order>({
    queryKey: ["/api/orders", lastOrderId],
    enabled: lastOrderId != null,
    refetchInterval: 6000,
  });

  const orderCode =
    order?.orderCode || (lastOrderId != null ? `PC-${String(lastOrderId).padStart(4, "0")}` : "");
  const amount = (totalCents / 100).toFixed(2);
  const noteText = orderCode ? `PuffGo order ${orderCode}` : "PuffGo order";
  // Cash App's hosted-link "note" param doesn't always pre-fill the receiver
  // note, but the deep link still works for the amount + recipient — the user
  // tap the note field manually if needed.
  const cashAppUrl = `https://cash.app/${CASHTAG}/${amount}`;

  function copy(value: string, kind: "tag" | "code" | "amount", label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 1400);
      toast({ title: `${label} copied`, description: value });
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
      {/* Hero — amount + cashtag + clearly-stamped order code */}
      <div className="rounded-3xl border border-card-border bg-gradient-to-b from-primary/15 via-card to-card p-5 mb-4 text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
          Cash App only · exact amount
        </p>
        <div
          className="text-4xl font-bold tabular-nums text-primary mb-1 leading-none"
          data-testid="text-pay-total"
        >
          ${amount}
        </div>
        <div className="text-sm text-muted-foreground mb-3">to</div>
        <div className="text-2xl font-bold mb-4" data-testid="text-cashtag">
          {CASHTAG}
        </div>

        <a href={cashAppUrl} target="_blank" rel="noreferrer" data-testid="link-cashapp">
          <Button className="ember-button h-12 w-full text-base font-semibold">
            <ExternalLink className="size-4 mr-2" />
            Open Cash App
          </Button>
        </a>
      </div>

      {/* Three copyable rows — cashtag, amount, order code */}
      <div className="rounded-2xl border border-card-border bg-card p-2 mb-4 divide-y divide-border/60">
        <CopyRow
          icon={<DollarSign className="size-4 text-primary" />}
          label="Cashtag"
          value={CASHTAG}
          monospace
          copied={copied === "tag"}
          onCopy={() => copy(CASHTAG, "tag", "Cashtag")}
          testid="row-copy-cashtag"
        />
        <CopyRow
          icon={<DollarSign className="size-4 text-primary" />}
          label="Exact amount"
          value={`$${amount}`}
          monospace
          copied={copied === "amount"}
          onCopy={() => copy(amount, "amount", "Amount")}
          testid="row-copy-amount"
        />
        <CopyRow
          icon={<Hash className="size-4 text-primary" />}
          label="Order code · paste into Cash App note"
          value={orderCode || "Generating…"}
          monospace
          highlight
          copied={copied === "code"}
          onCopy={() => orderCode && copy(orderCode, "code", "Order code")}
          testid="row-copy-ordercode"
        />
      </div>

      {/* Step-by-step instructions */}
      <div className="rounded-2xl border border-card-border bg-card p-4 mb-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Send className="size-4 text-primary" />
          How to pay
        </h3>
        <ol className="text-sm text-foreground/85 space-y-3">
          <Step n={1}>
            Tap <span className="font-semibold">Open Cash App</span> above (or copy the cashtag
            and paste it into Cash App).
          </Step>
          <Step n={2}>
            Send <span className="font-mono font-semibold text-foreground">${amount}</span> to{" "}
            <span className="font-mono font-semibold text-foreground">{CASHTAG}</span> — exact
            amount, no tip on top.
          </Step>
          <Step n={3}>
            In the Cash App <span className="font-semibold">note / "for"</span> field, paste your
            order code:{" "}
            <span className="font-mono font-semibold text-primary">{orderCode || "PC-..."}</span>.
            This is how we match your payment to your order.
          </Step>
          <Step n={4}>
            Tap <span className="font-semibold">"I sent it"</span> below — once the operator
            confirms the Cash App transfer, your driver is dispatched. Show 21+ ID at handoff.
          </Step>
        </ol>
      </div>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 mb-4 text-[12px] leading-snug text-amber-100/90">
        <span className="font-semibold text-amber-300">Important: </span>
        Don't forget the order code in the note. Without it, your Cash App transfer can't be
        matched to your order automatically.
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground mb-6">
        PuffGo does not process payment and does not store payment information. Cash App is a
        third-party service — using it is not a claim of compliance with any specific regulatory
        requirement.
      </p>

      <Disclaimer />

      <StickyFooter>
        <Button
          onClick={markSent}
          className="ember-button w-full h-12 font-semibold"
          data-testid="button-mark-sent"
        >
          I sent the payment
        </Button>
      </StickyFooter>
    </Shell>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="size-6 rounded-full bg-primary/15 border border-primary/25 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <span className="leading-snug pt-0.5">{children}</span>
    </li>
  );
}

function CopyRow({
  icon,
  label,
  value,
  monospace,
  highlight,
  copied,
  onCopy,
  testid,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  monospace?: boolean;
  highlight?: boolean;
  copied: boolean;
  onCopy: () => void;
  testid?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3" data-testid={testid}>
      <div className="size-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-0.5">
          {label}
        </div>
        <div
          className={`truncate ${monospace ? "font-mono" : ""} ${
            highlight ? "text-primary text-base font-bold" : "text-sm font-semibold"
          }`}
        >
          {value}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-3 shrink-0"
        onClick={onCopy}
        data-testid={`${testid}-button`}
      >
        {copied ? (
          <>
            <Check className="size-3.5 mr-1.5" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5 mr-1.5" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}
