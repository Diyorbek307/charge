import { Globe } from 'lucide-react';
import { useI18n, LANGS, type Lang } from '../lib/i18n';

/**
 * Replaces the static "UZ · RU · EN" label that used to sit in the header.
 * Rendered as a radio group so screen readers announce the current choice.
 */
export default function LangSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div
      role="radiogroup"
      aria-label="Язык интерфейса"
      className={`flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] px-1 py-0.5 ${className}`}
    >
      <Globe size={11} className="text-slate-500 ml-1 mr-0.5 shrink-0" aria-hidden="true" />
      {LANGS.map(l => {
        const active = l.id === lang;
        return (
          <button
            key={l.id}
            role="radio"
            aria-checked={active}
            title={l.full}
            onClick={() => setLang(l.id as Lang)}
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide transition-colors ${
              active ? 'bg-sky-400/15 text-sky-300' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
