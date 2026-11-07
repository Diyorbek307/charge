// Moved out of DriverApp.tsx: ReviewsScreen, reportCategories, ReportScreen.
import { useState } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Send } from 'lucide-react';
import { Station } from '../../../data/mockData';
import { useLiveStations } from '../../../lib/live';
import { useSync } from '../../../lib/sync';
import { useMyLocation, km } from '../../../lib/geo';

export function ReviewsScreen({ station, onBack }: { station: Station | null; onBack: () => void }) {
  const { state, sessions: portalSessions } = useSync();
  const me = portalSessions.driver;
  const mine = (state?.sessions ?? []).filter(x => x.userId === me?.id && x.stationId === station?.id && x.status === 'completed');
  const rated = mine.filter(x => x.rating);
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Оценки станции</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
          <p className="text-4xl font-bold text-slate-900 tabular-nums">{station ? station.rating.toFixed(1) : '—'}</p>
          <p className="text-amber-400 text-lg">{'★★★★★'.slice(0, Math.round(station?.rating ?? 0))}<span className="text-slate-200">{'★★★★★'.slice(Math.round(station?.rating ?? 0))}</span></p>
          <p className="text-xs text-slate-400 mt-1">{`${station?.reviews ?? 0} оценок водителей после зарядки`}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-sm font-semibold text-slate-800 mb-1">Ваши оценки</p>
          {mine.length === 0 ? (
            <p className="text-sm text-slate-500">Оценить станцию можно после зарядки на ней — на экране чека или в истории.</p>
          ) : (
            <p className="text-sm text-slate-500">{`Зарядок здесь: ${mine.length}, оценено: ${rated.length}. Неоценённые зарядки — в истории.`}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const reportCategories = [
  { id: 'broken', icon: '🔧', label: 'Неисправный разъём', sub: 'Разъём не работает или повреждён' },
  { id: 'stuck', icon: '🔒', label: 'Разъём застрял', sub: 'Невозможно извлечь кабель' },
  { id: 'payment', icon: '💳', label: 'Проблема с оплатой', sub: 'Не списалось или лишнее списание' },
  { id: 'slow', icon: '🐌', label: 'Медленная зарядка', sub: 'Мощность ниже заявленной' },
  { id: 'app', icon: '📱', label: 'Проблема с приложением', sub: 'Не запускается зарядка через приложение' },
  { id: 'safety', icon: '⚠️', label: 'Вопрос безопасности', sub: 'Запах гари, искры или другое' },
  { id: 'other', icon: '💬', label: 'Другое', sub: 'Произвольное описание' },
];

export function ReportScreen({ station: given, onBack }: { station: Station | null; onBack: () => void }) {
  const { actions } = useSync();
  const stations = useLiveStations();
  const here = useMyLocation();
  // Opened from Support there is no station yet: the nearest one is the likely one, and it can be changed.
  const nearestFirst = here ? [...stations].sort((a, b) => km(here, { lat: a.geoLat, lng: a.geoLng }) - km(here, { lat: b.geoLat, lng: b.geoLng })) : stations;
  const [pickedId, setPickedId] = useState<string>('');
  const station = given ?? stations.find(x => x.id === pickedId) ?? null;
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const submit = async () => {
    const chosen = reportCategories.find(c => c.id === category);
    if (!station || !chosen) return;
    setSending(true);
    setSendError(null);
    try {
      const { alert } = await actions.reportIssue('driver', station.id, { category: chosen.label, details: text });
      setSent(alert.id);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  if (sent) return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-slate-900">Сообщить о проблеме</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mb-5 text-4xl pg-pop">✅</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Сообщение отправлено</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">Мы передали информацию оператору станции. Как правило, проблемы устраняются в течение 24 часов.</p>
        <div className="w-full bg-sky-50 border border-sky-100 rounded-2xl p-4 text-left">
          <p className="text-xs font-semibold text-sky-700 mb-2">НОМЕР ЗАЯВКИ</p>
          <p className="text-lg font-bold text-sky-800 mono">{sent}</p>
          <p className="text-xs text-sky-600 mt-1">Вы получите уведомление после устранения</p>
        </div>
        <button onClick={onBack} className="mt-6 w-full bg-sky-500 text-white rounded-2xl py-3.5 font-semibold text-base">Закрыть</button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Сообщить о проблеме</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!given && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <label htmlFor="report-station" className="text-xs font-semibold text-slate-500 mb-2 block">СТАНЦИЯ</label>
            <select id="report-station" value={pickedId} onChange={e => setPickedId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 text-slate-800 bg-white">
              <option value="">Выберите станцию</option>
              {nearestFirst.map(x => <option key={x.id} value={x.id}>{`${x.name} · ${x.city}`}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1.5">{here ? 'Сначала ближайшие к вам' : 'Сообщение получит оператор этой станции'}</p>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">КАТЕГОРИЯ ПРОБЛЕМЫ</p>
          <div className="space-y-2">
            {reportCategories.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)} aria-pressed={category === cat.id}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${category === cat.id ? 'border-red-400 bg-red-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                <span className="text-xl">{cat.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{cat.label}</p>
                  <p className="text-xs text-slate-400">{cat.sub}</p>
                </div>
                {category === cat.id && <div className="w-5 h-5 bg-red-400 rounded-full flex items-center justify-center shrink-0 pg-pop">
                  <CheckCircle size={12} className="text-white" />
                </div>}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">ОПИСАНИЕ (необязательно)</p>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 500))} aria-label="Описание проблемы"
            placeholder="Подробности: номер разъёма, когда началось…"
            className="w-full text-sm border border-slate-200 rounded-xl p-3 outline-none resize-none focus:border-red-300 text-slate-700 placeholder:text-slate-300"
            rows={4} />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <AlertTriangle size={12} />При проблеме с безопасностью немедленно отключитесь и отойдите от станции.
          </p>
        </div>
      </div>
      <div className="px-4 pb-6 pt-2">
        {sendError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2 pg-shake">{sendError}</p>
        )}
        <button onClick={submit}
          disabled={!category || !station || sending}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${category && station ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
          <Send size={16} />{sending ? 'Отправляем…' : !station ? 'Выберите станцию' : !category ? 'Выберите проблему' : 'Отправить сообщение'}
        </button>
      </div>
    </div>
  );
}
