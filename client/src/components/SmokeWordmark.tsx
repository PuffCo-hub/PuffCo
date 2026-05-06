import logoReference from "@/assets/brand/puffco-logo-reference.jpeg";

/**
 * PuffCo wordmark — uses the user's smoke-logo reference directly for this
 * prototype pass so the app matches the requested visual direction.
 */
type Props = {
  size?: number; // height in px
  className?: string;
  showCo?: boolean;
};

export function SmokeWordmark({
  size = 56,
  className = "",
  showCo: _showCo = true,
}: Props) {
  const w = size * 2.55;
  return (
    <img
      role="img"
      aria-label="PuffCo"
      src={logoReference}
      width={w}
      height={size}
      className={`object-contain rounded-sm ${className}`}
      style={{ width: w, height: size }}
      data-testid="img-wordmark"
    />
  );
}

/** Simplified mark for tight spaces / favicons. */
export function SmokeMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PuffCo mark"
    >
      <defs>
        <linearGradient id="markGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe8d0" />
          <stop offset="100%" stopColor="#9b8895" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="38" rx="22" ry="14" fill="url(#markGrad)" opacity="0.85" />
      <ellipse cx="22" cy="22" rx="10" ry="6" fill="#d8cdd5" opacity="0.7" />
      <ellipse cx="42" cy="18" rx="8" ry="5" fill="#cfc4cd" opacity="0.6" />
      <circle cx="32" cy="54" r="2.4" fill="#ff8a3d" />
    </svg>
  );
}
