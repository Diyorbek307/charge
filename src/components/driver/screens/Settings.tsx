// Moved out of DriverApp.tsx: AppSettingsScreen, OfflineSection.
import { useState, useEffect, type ReactNode } from 'react';
import { ChevronRight, X, ArrowLeft } from 'lucide-react';
import { useSync } from '../../../lib/sync';
import { BRAND } from '../../../brand';
import { useOfflinePacks, deletePack, packsBytes } from '../../../lib/offline';
import { usePlatform } from '../../../lib/platform';
import { useI18n } from '../../../lib/i18n';
import { readLarge } from './ChargingStart';
import { APP_VERSION } from './shared';

export function AppSettingsScreen({ onBack, onReplayTour }: { onBack: () => void; onReplayTour: () => void }) {
  // The app's language, not a local copy of it.
  const { lang: language, setLang: setLanguage } = useI18n();
  const { sessions, actions, updateAccount } = useSync();
  const consent = sessions.driver?.consent ?? null;
  const consentVersion = usePlatform().onboarding.consentVersion;
  // Promotions are what the driver agreed to in the agreement, so the switch lives on the account.
  const [marketingBusy, setMarketingBusy] = useState(false);
  const flipMarketing = async () => {
    if (marketingBusy) return;
    setMarketingBusy(true);
    try {
      const { user } = await actions.acceptConsent({ version: consent?.version ?? consentVersion, marketing: !consent?.marketing });
      updateAccount('driver', user);
    } catch {
      /* the switch stays where it was */
    } finally {
      setMarketingBusy(false);
    }
  };
  const [large, setLarge] = useState(() => readLarge());
  useEffect(() => {
    try {
      localStorage.setItem('oc-large', large ? '1' : '0');
    } catch {
      /* private mode: this session only */
    }
    window.dispatchEvent(new CustomEvent('oc-large-change', { detail: { large } }));
  }, [large]);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(
    () => (localStorage.getItem('oc-theme') === 'dark' ? 'dark' : localStorage.getItem('oc-theme') === 'auto' ? 'auto' : 'light')
  );

  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    localStorage.setItem('oc-theme', theme);
    window.dispatchEvent(new CustomEvent('oc-theme-change', { detail: { dark: isDark } }));
  }, [theme]);
  // The switches are remembered on this device; before, they reset on every visit.
  const [notes, setNotes] = useState<Record<'charge' | 'price' | 'nearby' | 'promo', boolean>>(() => {
    const base = { charge: true, price: true, nearby: false, promo: true };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem('oc-note-prefs') ?? '{}') };
    } catch {
      return base;
    }
  });
  const flip = (k: keyof typeof notes) => setNotes(n => {
    const next = { ...n, [k]: !n[k] };
    try {
      localStorage.setItem('oc-note-prefs', JSON.stringify(next));
    } catch {
      /* private mode */
    }
    return next;
  });
  const [cacheNote, setCacheNote] = useState<string | null>(null);
  const clearMapCache = async () => {
    let n = 0;
    try {
      for (const key of await caches.keys()) if (/tile|map/i.test(key)) n += (await caches.delete(key)) ? 1 : 0;
    } catch {
      /* no Cache Storage here */
    }
    setCacheNote(n ? 'Кэш карт очищен' : 'Кэш карт уже пуст');
    setTimeout(() => setCacheNote(null), 2500);
  };

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) => (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-300 shrink-0 ${value ? 'bg-[#FFB000]' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  const SectionHeader = ({ label }: { label: string }) => (
    <p className="text-xs font-semibold text-slate-400 tracking-widest px-4 pt-5 pb-2">{label}</p>
  );

  const Row = ({ label, right }: { label: string; right: ReactNode }) => (
    <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50 last:border-none">
      <span className="text-sm text-slate-700">{label}</span>
      {right}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Настройки приложения</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SectionHeader label="ИНТЕРФЕЙС" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-50">
            <p className="text-sm text-slate-700 mb-2">Язык</p>
            <div className="flex gap-2">
              {([['ru', 'Русский'], ['uz', "O'zbek"], ['en', 'English']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLanguage(val)}
                  aria-pressed={language === val}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${language === val ? 'bg-[#111] text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3.5 border-b border-slate-50 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-700">Крупный шрифт и кнопки</p>
              <p className="text-xs text-slate-400">Всё крупнее и проще нажимать — удобно в машине и для зрения</p>
            </div>
            <Toggle label="Крупный шрифт и кнопки" value={large} onChange={() => setLarge(v => !v)} />
          </div>
          <div className="px-4 py-3.5">
            <p className="text-sm text-slate-700 mb-2">Тема</p>
            <div className="flex gap-2">
              {([['light', 'Светлая'], ['dark', 'Тёмная'], ['auto', 'Авто']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTheme(val)}
                  aria-pressed={theme === val}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${theme === val ? 'bg-[#111] text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SectionHeader label="УВЕДОМЛЕНИЯ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <Row label="Зарядка завершена" right={<Toggle label="Зарядка завершена" value={notes.charge} onChange={() => flip('charge')} />} />
          <Row label="Снижение цен" right={<Toggle label="Снижение цен" value={notes.price} onChange={() => flip('price')} />} />
          <Row label="Новые станции рядом" right={<Toggle label="Новые станции рядом" value={notes.nearby} onChange={() => flip('nearby')} />} />
          <Row label="Скидки сетей" right={<Toggle label="Скидки сетей" value={notes.promo} onChange={() => flip('promo')} />} />
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-700">Акции и новости Voli</p>
              <p className="text-xs text-slate-400">Рассылка по вашему согласию — без неё сервис работает так же</p>
            </div>
            <Toggle label="Акции и новости Voli" value={!!consent?.marketing} onChange={() => void flipMarketing()} />
          </div>
        </div>

        <SectionHeader label="ОБУЧЕНИЕ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <button onClick={onReplayTour} className="px-4 py-3.5 flex items-center justify-between w-full hover:bg-slate-50">
            <span className="text-sm text-slate-700">Пройти обучение заново</span>
            <ChevronRight size={16} className="text-slate-400" />
          </button>
        </div>

        <SectionHeader label="ДАННЫЕ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
            <span className="text-sm text-slate-700">Валюта</span>
            <span className="text-sm text-slate-400">Сум (UZS)</span>
          </div>
          <button onClick={() => void clearMapCache()} className="px-4 py-3.5 flex items-center justify-between w-full hover:bg-slate-50">
            <span className="text-sm text-slate-700">Очистить кэш карт</span>
            <span key={cacheNote ?? 'idle'} className={`text-xs font-medium ${cacheNote ? 'text-emerald-600 pg-pop' : 'text-sky-600'}`}>{cacheNote ?? 'Очистить'}</span>
          </button>
        </div>

        <OfflineSection />

        <SectionHeader label="О ПРИЛОЖЕНИИ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden mb-6">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
            <span className="text-sm text-slate-700">Версия</span>
            <span className="text-sm text-slate-400">{APP_VERSION}</span>
          </div>
          {consent && (
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50 gap-3">
              <span className="text-sm text-slate-700">Соглашение принято</span>
              <span className="text-xs text-slate-400 text-right">{`редакция ${consent.version} · ${new Date(consent.at).toLocaleDateString(language === 'en' ? 'en-GB' : language === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tashkent' })}`}</span>
            </div>
          )}
          {[
            { label: 'Пользовательское соглашение', href: '/?doc=consent' },
            { label: 'Условия использования', href: '/?doc=terms' },
            { label: 'Политика конфиденциальности', href: '/?doc=privacy' },
            { label: 'Публичная оферта', href: '/?doc=offer' },
            { label: 'Отправить отзыв', href: `mailto:${BRAND.emails.support}?subject=${encodeURIComponent(`Отзыв о ${BRAND.name}`)}` },
          ].map(item => (
            <a key={item.label} href={item.href} target={item.href.startsWith('/') ? '_blank' : undefined} rel="noreferrer" className="px-4 py-3.5 flex items-center justify-between w-full border-b border-slate-50 last:border-none hover:bg-slate-50 transition-colors">
              <span className="text-sm text-slate-700">{item.label}</span>
              <ChevronRight size={16} className="text-slate-400" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Saved roads for driving without signal, and the room they take. */
export function OfflineSection() {
  const packs = useOfflinePacks();
  return (
    <>
      <p className="text-xs font-semibold text-slate-400 tracking-widest px-4 pt-5 pb-2">ОФЛАЙН-КАРТЫ</p>
      <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
        {packs.length === 0 ? (
          <p className="px-4 py-3.5 text-sm text-slate-500">Пока нет. В «Поездке» выберите маршрут и нажмите «Сохранить для офлайна» — карта трассы, станции и коды будут работать без связи.</p>
        ) : (
          <>
            {packs.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3 border-b border-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{`${Math.max(1, Math.round(p.bytes / 1048576))} МБ · ${p.stations.length} станций · ${new Date(p.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}</p>
                </div>
                <button onClick={() => void deletePack(p.id)} aria-label={`Удалить ${p.name}`} className="p-2 rounded-xl bg-red-50 text-red-600"><X size={14} /></button>
              </div>
            ))}
            <p className="px-4 py-2.5 text-xs text-slate-400">{`Всего ${Math.max(1, Math.round(packsBytes(packs) / 1048576))} МБ на этом телефоне`}</p>
          </>
        )}
      </div>
    </>
  );
}
