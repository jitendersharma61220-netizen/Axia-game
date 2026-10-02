export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <span className="rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-xs font-semibold text-warn">Coming soon</span>
      <h1 className="mt-4 text-3xl font-black">{title}</h1>
      <div className="mt-3 text-muted">{children}</div>
      <p className="mt-6 text-xs text-muted">
        Paid access and rewards will launch only after legal and payment-gateway review.
      </p>
    </div>
  );
}
