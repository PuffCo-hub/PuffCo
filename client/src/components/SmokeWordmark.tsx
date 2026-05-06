/**
 * PuffGo wordmark — customer-facing brand mark with a soft smoke/cloud feel.
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
    <div
      role="img"
      aria-label="PuffGo"
      className={`relative inline-flex items-center justify-center font-extrabold tracking-[-0.08em] text-white ${className}`}
      style={{
        width: w,
        height: size,
        fontSize: size * 0.55,
        lineHeight: 1,
        textShadow:
          "0 0 18px rgba(255,255,255,0.42), 0 0 34px rgba(72,255,151,0.26)",
      }}
      data-testid="img-wordmark"
    >
      <span
        aria-hidden
        className="absolute inset-x-3 top-1/2 h-1/2 -translate-y-1/2 rounded-full bg-white/15 blur-xl"
      />
      <span className="relative">
        Puff<span className="text-primary drop-shadow-[0_0_18px_rgba(72,255,151,0.45)]">Go</span>
      </span>
    </div>
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
      aria-label="PuffGo mark"
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
