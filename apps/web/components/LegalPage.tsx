import Link from 'next/link';
import { LEGAL, isPlaceholder } from '@/lib/legal';

/** Renders a LEGAL value; unfilled placeholders are highlighted so they can't ship unnoticed. */
export function L({ k }: { k: keyof Omit<typeof LEGAL, 'isDraft'> }) {
  const v = LEGAL[k];
  if (!isPlaceholder(v)) return <>{v}</>;
  return <mark className="rounded bg-warn/20 px-1 text-warn">{v}</mark>;
}

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: React.ReactNode;
  sections: { id: string; title: string; body: React.ReactNode }[];
}) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 pb-16">
      {LEGAL.isDraft && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn" role="note">
          <b>Draft, not yet reviewed by a lawyer.</b> This text is a starting point for legal review and may change before
          {` ${LEGAL.brand}`} launches publicly. Highlighted items still need to be filled in.
        </div>
      )}
      <header>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          Effective: <L k="effectiveDate" />
        </p>
      </header>
      <div className="text-muted">{intro}</div>
      <nav className="card p-4 text-sm" aria-label="Contents">
        <p className="mb-2 font-semibold">Contents</p>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          {sections.map((s) => (
            <li key={s.id}>
              <a className="hover:text-white" href={`#${s.id}`}>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-20 space-y-3">
          <h2 className="text-xl font-bold">
            {i + 1}. {s.title}
          </h2>
          <div className="legal space-y-3 leading-relaxed text-[#cfd5ee]">{s.body}</div>
        </section>
      ))}
      <footer className="border-t border-line pt-4 text-sm text-muted">
        See also: <Link href="/terms">Terms of Service</Link> · <Link href="/privacy">Privacy Policy</Link> ·{' '}
        <Link href="/refunds">Refund &amp; Cancellation Policy</Link>
      </footer>
    </article>
  );
}
