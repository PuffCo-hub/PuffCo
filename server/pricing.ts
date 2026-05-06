// Server-side pricing engine.
//
// The customer-facing app shows estimated prices that already include the
// configured markup (computed client-side from settings). This module is the
// authoritative source for the final fees applied to an order, and it never
// receives or returns any supplier-cost data. It only takes the customer's
// estimated subtotal and the active pricing settings, then returns the
// service fee (or revenue split share) and the total.

import type { PricingSettings } from "@shared/schema";

export type PricingBreakdown = {
  subtotalCents: number;
  tipCents: number;
  feeCents: number;
  totalCents: number;
  // Useful for the admin/audit log. NEVER sent to customer-facing endpoints
  // alongside any supplier cost data.
  mode: PricingSettings["mode"];
};

export function computePricing(
  subtotalCents: number,
  tipCents: number,
  pricing: PricingSettings,
): PricingBreakdown {
  const safeSubtotal = Math.max(0, Math.round(subtotalCents));
  const safeTip = Math.max(0, Math.round(tipCents));

  let feeCents = 0;
  if (pricing.mode === "service_fee") {
    const flat = Math.max(0, Math.round(pricing.serviceFeeFlatCents || 0));
    const pct = Math.max(0, Number(pricing.serviceFeePercent || 0));
    feeCents = flat + Math.round(safeSubtotal * (pct / 100));
  } else {
    // Revenue split — the platform's share is computed but does NOT change the
    // total the customer pays. We still record it on the order for reporting.
    const pct = Math.max(0, Number(pricing.revenueSplitPercent || 0));
    feeCents = Math.round(safeSubtotal * (pct / 100));
  }

  const totalCents =
    pricing.mode === "service_fee"
      ? safeSubtotal + safeTip + feeCents
      : safeSubtotal + safeTip; // revenue_split doesn't add to customer total

  return {
    subtotalCents: safeSubtotal,
    tipCents: safeTip,
    feeCents,
    totalCents,
    mode: pricing.mode,
  };
}
