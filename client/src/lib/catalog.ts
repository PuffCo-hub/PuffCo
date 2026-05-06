// PuffGo catalog helpers. Products come from the backend database so they can
// be added/edited from Admin without touching code. The server augments the
// raw row with derived `available` and `lowStock` flags so the customer side
// can disable add-to-cart instantly when stock hits zero.
import type { Product as DbProduct } from "@shared/schema";

export type Product = DbProduct & {
  available: boolean;
  lowStock: boolean;
};

export type CategoryId = "vapes" | "carts" | "glass" | "papers" | "wraps" | "accessories";

export const CATEGORY_OPTIONS: {
  id: CategoryId;
  label: string;
  helper: string;
  subcategories: string[];
}[] = [
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
    id: "glass",
    label: "Glass",
    helper: "Bongs, bubblers, pipes, and rigs",
    subcategories: ["Bongs", "Bubblers", "Spoon Pipes", "Rigs", "Beakers", "Chillums", "One-Hitters", "Ash Catchers", "Bowls", "Downstems"],
  },
  {
    id: "papers",
    label: "Papers",
    helper: "Rolling papers, cones, and trays",
    subcategories: ["RAW", "Elements", "Zig-Zag", "OCB", "King Palm", "Blazy Susan", "Cones", "1¼ Size", "King Size", "Rolling Trays"],
  },
  {
    id: "wraps",
    label: "Wraps",
    helper: "Wraps, leaves, and hemp rolls",
    subcategories: ["Backwoods", "Dutch Masters", "Swisher", "White Owl", "Game", "High Hemp", "Juicy Jay's", "Zig-Zag Wraps", "Grabba", "Fronto"],
  },
  {
    id: "accessories",
    label: "Accessories",
    helper: "Lighters, grinders, batteries, and tools",
    subcategories: ["Lighters", "Grinders", "Batteries", "Torches", "Trays", "Storage", "Cleaning", "Scales", "Tips", "Tools"],
  },
];

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
