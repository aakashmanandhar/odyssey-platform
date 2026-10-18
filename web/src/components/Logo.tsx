// Odyssey mark: a sailboat inside a circle (horizon and journey). Original drawing, 24x24 grid.
export function OdysseyMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path fill="currentColor" d="M12.7 5.4c3.3 2.5 4.6 5.6 4.1 9.1h-4.1z" />
      <path fill="currentColor" opacity=".72" d="M11.5 7.4c-2.1 2-3.3 4.4-3.5 7.1h3.5z" />
      <path fill="currentColor" d="M6.9 15.6h10.2c-.5 1.3-1.5 2-2.9 2H9.8c-1.4 0-2.4-.7-2.9-2z" />
    </svg>
  );
}
