// PuffGo catalog helpers. Products come from the backend database so they can
// be added/edited from Admin without touching code. The server augments the
// raw row with derived `available` and `lowStock` flags so the customer side
// can disable add-to-cart instantly when stock hits zero.
import type { Product as DbProduct } from "@shared/schema";

export type Product = DbProduct & {
  available: boolean;
  lowStock: boolean;
};

export type Shop = {
  id: string;
  name: string;
  blurb: string;
  serviceArea: string;
  active: boolean;
  open: boolean;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  imageUrl: string;
  accent: string;
};

export type CategoryId =
  | "vapes"
  | "carts"
  | "glass"
  | "papers"
  | "wraps"
  | "flower"
  | "accessories";

export type CategoryOption = {
  id: CategoryId;
  label: string;
  helper: string;
  subcategories: string[];
  // DB categories whose products belong in this customer-facing section.
  // Defaults to [id] when omitted. Lets us merge "papers" + "wraps" into one
  // visible "Papers/Wraps" tile without touching stored product rows.
  matches?: CategoryId[];
  // Optional fallback Lucide icon name used by the customer Menu's category
  // tile when no product in this section has loaded yet, so the tile still
  // has a representative thumbnail. Resolved in Menu.tsx.
  fallbackIcon?: "grinder" | "leaf" | "flame" | "package";
};

export const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: "vapes",
    label: "Vapes",
    helper: "Disposable devices and pod systems",
    subcategories: ["Geek Bar", "Lost Mary", "Elf Bar", "RAZ", "STIIIZY", "Rove", "Fume", "Hyde", "Flum", "HQD"],
  },
  {
    id: "carts",
    label: "Carts",
    helper: "510 carts, pods, and batteries",
    subcategories: ["Rove", "Select", "Cookies", "STIIIZY", "PuffGo", "CCELL", "Lookah", "Yocan", "Raw Garden", "PlugPlay"],
  },
  {
    id: "flower",
    label: "Flower",
    helper: "Hemp and CBD flower",
    subcategories: ["Indica", "Sativa", "Hybrid", "Pre-Rolls", "Eighths", "Quarters"],
  },
  {
    id: "glass",
    label: "Glass",
    helper: "Bongs, bubblers, pipes, and rigs",
    subcategories: ["Bongs", "Bubblers", "Spoon Pipes", "Rigs", "Beakers", "Chillums", "One-Hitters", "Ash Catchers", "Bowls", "Downstems"],
  },
  {
    id: "papers",
    label: "Papers/Wraps",
    helper: "Rolling papers, cones, wraps, and trays",
    matches: ["papers", "wraps"],
    subcategories: [
      "RAW", "Elements", "Zig-Zag", "OCB", "King Palm", "Blazy Susan", "Cones", "Rolling Trays",
      "Backwoods", "Dutch Masters", "Swisher", "White Owl", "Game", "High Hemp", "Juicy Jay's", "Grabba",
    ],
  },
  {
    id: "accessories",
    label: "Accessories",
    helper: "Lighters, grinders, batteries, and tools",
    subcategories: ["Lighters", "Grinders", "Batteries", "Torches", "Trays", "Storage", "Cleaning", "Scales", "Tips", "Tools"],
    fallbackIcon: "grinder",
  },
];

// Returns true when a product's stored DB category belongs in the given
// customer-facing section. Sections without an explicit `matches` list only
// claim their own id.
export function categoryMatches(option: CategoryOption, productCategory: string): boolean {
  const ids = option.matches ?? [option.id];
  return ids.includes(productCategory as CategoryId);
}

// Customer-facing markup applied to listed prices. Mirrors the
// `pricing.markupPercent` setting served by /api/settings; when the setting
// loads we update this in-memory so the UI re-renders with live values. The
// default keeps the existing 18% behaviour if /api/settings is unreachable.
export let MARKUP_PCT = 0.18;
export function setMarkupPercent(pct: number) {
  if (typeof pct === "number" && Number.isFinite(pct) && pct >= 0) {
    MARKUP_PCT = pct / 100;
  }
}

export function applyMarkup(cents: number): number {
  return Math.round(cents * (1 + MARKUP_PCT));
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
