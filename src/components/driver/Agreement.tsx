import { useState } from 'react';
import { Check, ChevronRight, FileText, X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { LEGAL } from '../../landing/legal';

export interface Agreed {
  terms: boolean;
  data: boolean;
  marketing: boolean;
}
export const NOTHING_AGREED: Agreed = { terms: false, data: false, marketing: false };
export const agreedEnough = (a: Agreed) => a.terms && a.data;

/**
 * The agreement where an account is made: 18+ and the terms, consent to the
 * processing of personal data (both required), promotions (optional), and the
 * full text one tap away. Dark, to sit in the sign-in card.
 */
export function AgreementChecks({ value, onChange }: { value: Agreed; onChange: (a: Agreed) => void }) {
  const [reading, setReading] = useState(false);
  const all = value.terms && value.data && value.marketing;
  const flip = (k: keyof Agreed) => onChange({ ...value, [k]: !value[k] });
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
      <DarkCheck checked={all} onChange={() => onChange({ terms: !all, data: !all, marketing: !all })} strong>Принять всё</DarkCheck>
      <DarkCheck checked={value.terms} onChange={() => flip('terms')} required>Мне есть 18 лет, я принимаю Пользовательское соглашение и Публичную оферту</DarkCheck>
      <DarkCheck checked={value.data} onChange={() => flip('data')} required>Согласен на обработку моих персональных данных, как описано в соглашении</DarkCheck>
      <DarkCheck checked={value.marketing} onChange={() => flip('marketing')}>Хочу получать акции, скидки сетей и новости (можно отключить в профиле)</DarkCheck>
      <button type="button" onClick={() => setReading(true)} className="w-full flex items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-[#C6F432] border-t border-white/10">
        <FileText size={15} className="shrink-0" />
        <span className="flex-1">Читать соглашение полностью</span>
        <ChevronRight size={16} className="text-white/40" />
      </button>
      {reading && <LegalSheet onClose={() => setReading(false)} />}
    </div>
  );
}

function DarkCheck({ checked, onChange, children, required, strong }: { checked: boolean; onChange: () => void; children: React.ReactNode; required?: boolean; strong?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onChange} className={`w-full flex items-start gap-3 px-4 py-3 text-left border-t border-white/10 first:border-t-0 ${strong ? 'bg-white/[0.04]' : ''}`}>
      <span className={`mt-0.5 w-[22px] h-[22px] rounded-[7px] grid place-items-center shrink-0 transition-all duration-200 ${checked ? 'bg-[#C6F432] text-[#111]' : 'border-2 border-white/30'}`}>
        {checked && <Check size={14} strokeWidth={3} className="pg-fr-tick" />}
      </span>
      <span className={`text-[13px] leading-snug ${strong ? 'font-bold text-white' : 'text-white/75'}`}>
        {children}{required && <span className="text-[#C6F432]"> *</span>}
      </span>
    </button>
  );
}

/** The whole agreement, readable without leaving the screen. */
export function LegalSheet({ onClose }: { onClose: () => void }) {
  const doc = LEGAL.consent;
  const { lang } = useI18n();
  return (
    <div className="fixed inset-0 z-[10001] bg-white flex flex-col pg-sheet-in text-left" role="dialog" aria-modal="true" aria-label={doc.title}>
      <div className="px-4 h-14 flex items-center gap-2 border-b border-slate-100 shrink-0">
        <span className="flex-1 text-sm font-bold text-[#111] truncate">Пользовательское соглашение</span>
        <button type="button" onClick={onClose} aria-label="Закрыть" className="w-9 h-9 rounded-xl grid place-items-center text-slate-700 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {lang !== 'ru' && <p className="text-xs text-[#3D6B00] bg-[#F1FCD6] rounded-xl px-3 py-2.5 mb-4">Юридически значимый текст — на русском языке. Перевод на узбекский и английский готовится.</p>}
        <article lang="ru" data-no-translate className="text-[13px] leading-relaxed text-slate-700">
          <h1 className="text-lg font-extrabold text-[#111] leading-snug">{doc.title}</h1>
          <p className="text-xs text-slate-400 mt-1">Редакция от {doc.updated}</p>
          <p className="mt-3">{doc.intro}</p>
          {doc.sections.map(s => (
            <section key={s.h} className="mt-4">
              <h2 className="text-sm font-bold text-[#111] mb-1.5">{s.h}</h2>
              {s.p.map((t, n) => <p key={n} className="mb-1.5">{t}</p>)}
            </section>
          ))}
        </article>
      </div>
      <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0">
        <button type="button" onClick={onClose} className="w-full h-14 rounded-2xl bg-[#C6F432] text-[#111] font-bold text-base">Понятно</button>
      </div>
    </div>
  );
}
