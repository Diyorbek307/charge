import { ArrowLeft, FileText, TriangleAlert } from 'lucide-react';
import { LEGAL, type LegalDocId } from './legal';
import type { LandingCopy } from './content';

export const LEGAL_IDS: LegalDocId[] = ['offer', 'privacy', 'terms'];

export const legalHref = (id: LegalDocId) => `/?doc=${id}`;

/** A legal document rendered inside the landing shell (nav and footer stay). */
export default function LegalPage({ c, id }: { c: LandingCopy; id: LegalDocId }) {
  const doc = LEGAL[id];
  return (
    <section className="lp-sec lp-legal" id="top">
      <div className="lp-wrap lp-legal-in">
        <aside className="lp-legal-nav">
          <a href="/" className="lp-legal-back"><ArrowLeft size={16} />{c.legal.back}</a>
          <p className="lp-footer-h">{c.legal.title}</p>
          {LEGAL_IDS.map(d => (
            <a key={d} href={legalHref(d)} aria-current={d === id ? 'page' : undefined}>
              <FileText size={15} />{c.legal[d]}
            </a>
          ))}
        </aside>
        <article className="lp-legal-doc" lang="ru">
          <p className="lp-legal-draft" role="note"><TriangleAlert size={16} />{c.legal.draft}</p>
          {c.legal.ruOnly && <p className="lp-legal-ru">{c.legal.ruOnly}</p>}
          <h1 className="lp-h2">{doc.title}</h1>
          <p className="lp-legal-updated">{c.legal.updated} {doc.updated}</p>
          <p className="lp-legal-intro">{doc.intro}</p>
          {doc.sections.map(s => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p.map((t, i) => <p key={i}>{t}</p>)}
            </section>
          ))}
        </article>
      </div>
    </section>
  );
}
