/* The FieldPilot mark: a surveyor's cut benchmark. A levelled rule with a broad
   arrow beneath marking the exact point — solid up to the datum, dashed past it.
   Same grammar as the datum rule in the app, so the identity is the instrument.
   Inherits ink from `currentColor`; only the outstanding dashes carry the mark
   colour. */
/* `size` is the drawn height. The viewBox crops to the artwork so the mark
   optically matches the wordmark's cap height instead of floating in padding;
   the square icon files keep their own margins. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      viewBox="0 5 32 23"
      width={(size * 32) / 23}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="7" width="14.5" height="3" fill="currentColor" />
      <rect x="18.5" y="7" width="5" height="3" fill="var(--mark)" />
      <rect x="25" y="7" width="5" height="3" fill="var(--mark)" />
      <polygon points="16.25,12 23,26 9.5,26" fill="currentColor" />
    </svg>
  );
}
