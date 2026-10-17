// Odyssey mark: a Spartan (Corinthian) helmet in profile with a sweeping crest. Original drawing, 24x24 grid.
export function HelmetMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M6.2 9.4C7.4 4.6 10.2 1.9 13.6 1.9c4.2 0 7.4 3.6 8.2 9.7-1.2-3-3.9-5.4-8.2-5.7-3.2-.2-5.8 1.3-7.4 3.5z" />
      <path fill="currentColor" fillRule="evenodd" d="M5.3 18.6 4.8 13.2C5.4 9.2 8.4 6.9 12.2 6.9c4 0 6.6 3 7 6.8.2 2.3 0 4.5-.6 6.1.7.9 1.7 1.4 2.8 1.6h-5.8c-.3-1.8-1.1-2.8-2.2-2.8-1.3 0-2.5 1.4-3.4 3.6l-2.5-2-.5-4.3h-.8l.1 3.2z M6.1 13.3c1.4-.9 3.4-1 4.8-.3-1.4.9-3.4 1.1-4.8.3z" />
    </svg>
  );
}
