export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="state" role="status"><div className="spinner" /><span>{label}…</span></div>;
}
export function LoadError({ message }: { message: string }) {
  return (
    <div className="state" role="alert">
      <strong>We couldn't load this right now.</strong>
      <span className="muted">{message}</span>
      <button className="btn" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}
