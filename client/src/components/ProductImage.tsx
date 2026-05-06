import { useEffect, useState } from "react";
import type { Product } from "@/lib/catalog";

type Size = "compact" | "default" | "large";

type Props = {
  product: Product;
  /** Backwards-compatible compact flag. Prefer `size`. */
  compact?: boolean;
  size?: Size;
  className?: string;
};

// Inline SVG fallback when an image URL fails (e.g. admin-added URL is wrong
// or hotlinking blocked). Uses the product accent so each tile still feels
// distinct.
function FallbackArt({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="puffco-fallback" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="14" fill="url(#puffco-fallback)" />
      <circle cx="50" cy="50" r="22" fill="rgba(255,255,255,0.32)" />
      <circle cx="50" cy="50" r="11" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

const SIZE_CLASS: Record<Size, string> = {
  compact: "size-12",
  default: "h-24 w-24",
  large: "h-full w-full",
};

export function ProductImage({ product, compact = false, size, className }: Props) {
  const resolvedSize: Size = size ?? (compact ? "compact" : "default");
  const sizeClass = SIZE_CLASS[resolvedSize];
  const [errored, setErrored] = useState(false);
  const url = (product.imageUrl ?? "").trim();

  // Reset the error state when the product changes (admin edits the URL, the
  // user opens the next product, etc.) so a fresh attempt is made.
  useEffect(() => {
    setErrored(false);
  }, [url]);

  const showFallback = !url || errored;

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden rounded-2xl bg-white border border-black/5 relative ${className ?? ""}`}
      data-testid={`img-product-${product.id}`}
    >
      {showFallback ? (
        <FallbackArt accent={product.accent || "#ff7a1a"} />
      ) : (
        <img
          src={url}
          alt={product.name}
          className="h-full w-full object-contain p-1.5"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
