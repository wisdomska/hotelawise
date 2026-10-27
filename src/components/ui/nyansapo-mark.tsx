// Nyansapo, the Adinkra "wisdom knot": logo, favicon, loader and dividers.
export function NyansapoMark({ size = 30, strokeWidth = 1.5, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="5.5" />
      <circle cx="21" cy="11" r="5.5" />
      <circle cx="11" cy="21" r="5.5" />
      <circle cx="21" cy="21" r="5.5" />
      <rect x="12.5" y="12.5" width="7" height="7" transform="rotate(45 16 16)" />
    </svg>
  );
}
