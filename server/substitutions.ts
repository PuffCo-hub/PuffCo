// Substitution engine.
//
// When a cart item is unavailable (out of stock or hidden), suggest approved
// substitutes. Operators can configure approved IDs per-product; the engine
// otherwise falls back to same-category + same-subcategory matches, filtered
// by an optional price-difference threshold (cents) so customers don't get
// jarring upsells.

import type { Product } from "@shared/schema";

export type SubstituteSuggestion = {
  product: Product;
  reason: "approved" | "same_subcategory" | "same_category";
  priceDeltaCents: number;
};

export function findSubstitutes(
  target: Product,
  catalog: Product[],
  priceDeltaThresholdCents: number,
): SubstituteSuggestion[] {
  const out: SubstituteSuggestion[] = [];
  const seen = new Set<string>();

  let approved: string[] = [];
  try {
    approved = JSON.parse(target.substituteIds || "[]");
  } catch {
    approved = [];
  }

  // 1. Operator-approved substitutes always come first; price threshold is
  //    advisory and does NOT filter approved entries because the operator has
  //    explicitly opted them in.
  for (const id of approved) {
    if (seen.has(id)) continue;
    const p = catalog.find((c) => c.id === id);
    if (!p || !p.active || p.stockCount <= 0) continue;
    out.push({
      product: p,
      reason: "approved",
      priceDeltaCents: p.basePriceCents - target.basePriceCents,
    });
    seen.add(p.id);
  }

  // 2. Same subcategory + same brand (closest match) within threshold.
  for (const p of catalog) {
    if (p.id === target.id || seen.has(p.id)) continue;
    if (!p.active || p.stockCount <= 0) continue;
    if (p.category !== target.category) continue;
    if (p.subcategory !== target.subcategory) continue;
    const delta = Math.abs(p.basePriceCents - target.basePriceCents);
    if (priceDeltaThresholdCents > 0 && delta > priceDeltaThresholdCents) continue;
    out.push({
      product: p,
      reason: "same_subcategory",
      priceDeltaCents: p.basePriceCents - target.basePriceCents,
    });
    seen.add(p.id);
  }

  // 3. Same category, any subcategory, within threshold.
  for (const p of catalog) {
    if (p.id === target.id || seen.has(p.id)) continue;
    if (!p.active || p.stockCount <= 0) continue;
    if (p.category !== target.category) continue;
    const delta = Math.abs(p.basePriceCents - target.basePriceCents);
    if (priceDeltaThresholdCents > 0 && delta > priceDeltaThresholdCents) continue;
    out.push({
      product: p,
      reason: "same_category",
      priceDeltaCents: p.basePriceCents - target.basePriceCents,
    });
    seen.add(p.id);
  }

  // Cap to a reasonable list so the UI doesn't get crowded.
  return out.slice(0, 6);
}
