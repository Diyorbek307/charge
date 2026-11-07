import { useMemo, useRef, useState } from 'react';
import { MapPin, Zap, PlugZap, AlertTriangle, Plus, X, Trash2, Copy, Check, QrCode, Upload, Download } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { StickerButton } from './Stickers';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, plural } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, SearchBox, Segmented, Empty } from '../admin/ui';

const TYPES = ['CCS2', 'Type2', 'GB/T DC', 'CHAdeMO'];
const DOT: Record<string, string> = { available: 'bg-emerald-500', occupied: 'bg-amber-500', reserved: 'bg-sky-500', unavailable: 'bg-slate-300' };

type Spec = { type: string; power: string; price: string };

/** One row per connector; rows with the same station name make one station. Excel saves CSV with ";". */
const TEMPLATE = [
  'Название;Город;Адрес;Широта;Долгота;Часы работы;Разъём;Мощность, кВт;Цена, сум за кВт·ч',
  'Chilonzor Hub;Toshkent;Bunyodkor shoh ko‘chasi 24;41.2856;69.2034;24/7;CCS2;120;2000',
  'Chilonzor Hub;Toshkent;Bunyodkor shoh ko‘chasi 24;41.2856;69.2034;24/7;Type2;22;1200',
  'Samarqand Darvoza;Samarqand;Registon ko‘chasi 5;39.6548;66.9757;08:00-22:00;CCS2;60;1900',
].join('\n') + '\n';

function parseStations(textIn: string) {
  const lines = textIn.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = [';', '\t', ','].find(c => lines[0].includes(c)) ?? ';';
  const cells = (l: string) => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  const body = /назван|name|nomi/i.test(lines[0]) ? lines.slice(1) : lines;
  const byName = new Map<string, { name: string; city: string; address: string; geoLat: number; geoLng: number; hours?: string; connectors: { type: string; power: number; price: number }[] }>();
  for (const l of body) {
    const [name = '', city = '', address = '', lat = '', lng = '', hours = '', type = '', power = '', price = ''] = cells(l);
    if (!name) continue;
    const key = name.toLowerCase();
    const st = byName.get(key) ?? { name, city, address, geoLat: Number(lat.replace(',', '.')), geoLng: Number(lng.replace(',', '.')), hours: hours || '24/7', connectors: [] };
    const t = TYPES.find(x => x.toLowerCase().replace(/\W/g, '') === type.toLowerCase().replace(/\W/g, '')) ?? type;
    if (type) st.connectors.push({ type: t, power: Number(power.replace(',', '.')), price: Number(price.replace(/\s/g, '')) });
    byName.set(key, st);
  }
  return [...byName.values()];
}

/** A whole network from a spreadsheet. */
function ImportStations({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ added: { id: string; name: string }[]; skipped: { name: string; reason: string }[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const template = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    a.download = 'voli-stations.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (f: File) => {
    setBusy(true);
    setError('');
    try {
      const stations = parseStations(await f.text());
      if (!stations.length) throw new Error('В файле нет станций');
      setResult(await apiClient.importStations(stations));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Загрузить станции файлом">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Загрузить станции файлом</h2>
          <button onClick={onClose} aria-label="Закрыть" className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {result ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-slate-800">{`Добавлено станций: ${result.added.length}`}</p>
            {result.added.length > 0 && <p className="text-slate-600">Каждая появится у водителей, как только её зарядное устройство подключится по OCPP 1.6-J. Логин устройства — номер станции:</p>}
            <div className="max-h-40 overflow-y-auto rounded-xl bg-slate-50 p-3 space-y-1">
              {result.added.map(a => <p key={a.id} className="text-xs text-slate-700"><code className="font-mono">{a.id}</code>{` · ${a.name}`}</p>)}
            </div>
            {result.skipped.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-amber-800">{`Не добавлены: ${result.skipped.length}`}</p>
                {result.skipped.map((x, i) => <p key={i} className="text-xs text-amber-800">{`${x.name}: ${x.reason}`}</p>)}
              </div>
            )}
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-[#FFC83D] text-[#111] font-bold">Готово</button>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Скачайте шаблон и заполните его в Excel или Google Таблицах.</li>
              <li>Одна строка — один разъём. Строки с одинаковым названием станут одной станцией.</li>
              <li>Сохраните как CSV и загрузите сюда — до 200 станций за раз.</li>
            </ol>
            <p className="text-xs text-slate-400">Сеть с OCPI 2.2.1 подключается целиком сама — напишите нам на partners@voli.uz.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={template} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 font-semibold text-slate-700"><Download size={15} />Скачать шаблон</button>
              <button disabled={busy} onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-500 text-white font-semibold disabled:opacity-40"><Upload size={15} />{busy ? 'Загружаем…' : 'Выбрать файл CSV'}</button>
              <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddStation({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { actions } = useSync();
  const [form, setForm] = useState({ name: '', city: 'Toshkent', address: '', lat: '', lng: '', hours: '24/7' });
  const [specs, setSpecs] = useState<Spec[]>([{ type: 'CCS2', power: '120', price: '2000' }, { type: 'Type2', power: '22', price: '1200' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await actions.addStation('operator', {
        name: form.name,
        city: form.city,
        address: form.address,
        geoLat: Number(form.lat.replace(',', '.')),
        geoLng: Number(form.lng.replace(',', '.')),
        hours: form.hours,
        connectors: specs.map(s => ({ type: s.type, power: Number(s.power), price: Number(s.price) })),
      });
      setDone({ id: res.station.id, url: `${location.origin.replace(/^http/, 'ws')}${res.ocpp.url}` });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-sky-400';

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Новая станция">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{done ? 'Станция создана' : 'Новая станция'}</h2>
          <button onClick={onClose} aria-label="Закрыть" className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {done ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Станция появится у водителей, как только зарядное устройство подключится к центральной системе по OCPP 1.6-J и сообщит статус разъёмов.</p>
            <div className="rounded-xl bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase">Адрес центральной системы</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-slate-800 break-all">{done.url}</code>
                <button onClick={() => { void navigator.clipboard?.writeText(done.url); setCopied(true); }} aria-label="Скопировать" className="p-1.5 rounded-lg border border-slate-200">{copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}</button>
              </div>
              <p className="text-xs text-slate-500">Логин (Charge Point ID): <b className="font-mono text-slate-800">{done.id}</b> · пароль — ключ OCPP вашей сети</p>
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-sky-500 text-white font-semibold">Готово</button>
          </div>
        ) : (
          <>
            <label className="block text-sm"><span className="text-xs font-semibold text-slate-500">Название</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={field} placeholder="Chilonzor Energy Park" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm"><span className="text-xs font-semibold text-slate-500">Город</span><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className={field} /></label>
              <label className="block text-sm"><span className="text-xs font-semibold text-slate-500">Часы работы</span><input value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} className={field} /></label>
            </div>
            <label className="block text-sm"><span className="text-xs font-semibold text-slate-500">Адрес</span><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={field} placeholder="Bunyodkor shoh ko‘chasi 24" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm"><span className="text-xs font-semibold text-slate-500">Широта</span><input inputMode="decimal" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} className={field} placeholder="41.2856" /></label>
              <label className="block text-sm"><span className="text-xs font-semibold text-slate-500">Долгота</span><input inputMode="decimal" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} className={field} placeholder="69.2034" /></label>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Разъёмы</p>
              <div className="space-y-2">
                {specs.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_90px_32px] gap-2 items-center">
                    <select value={s.type} onChange={e => setSpecs(specs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} aria-label="Тип" className={field}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
                    <input inputMode="decimal" value={s.power} onChange={e => setSpecs(specs.map((x, j) => (j === i ? { ...x, power: e.target.value } : x)))} aria-label="Мощность, кВт" className={field} />
                    <input inputMode="numeric" value={s.price} onChange={e => setSpecs(specs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label="Цена, сум/кВт·ч" className={field} />
                    <button onClick={() => setSpecs(specs.filter((_, j) => j !== i))} disabled={specs.length === 1} aria-label="Удалить разъём" className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">тип · кВт · сум за кВт·ч</p>
              {specs.length < 8 && <button onClick={() => setSpecs([...specs, { type: 'CCS2', power: '60', price: '1800' }])} className="mt-2 text-xs font-semibold text-sky-600 inline-flex items-center gap-1"><Plus size={12} />Добавить разъём</button>}
            </div>
            {error && <ErrorNote text={error} />}
            <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-xl bg-sky-500 text-white font-semibold disabled:opacity-50">{busy ? 'Создаём…' : 'Создать станцию'}</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function OperatorStations({ onOpen }: { onOpen: (stationId: string) => void }) {
  const { state, sessions, refresh } = useSync();
  const { data, reload } = useAnalytics('operator', 30);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'free' | 'busy' | 'down'>('all');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const org = sessions.operator?.orgId;

  const stats = useMemo(() => new Map((data?.stations ?? []).map(s => [s.id, s])), [data]);
  const own = (state?.stations ?? []).filter(s => s.operatorId === org);
  const shown = own.filter(s => {
    const q = query.trim().toLowerCase();
    if (q && ![s.name, s.city, s.address].some(v => v.toLowerCase().includes(q))) return false;
    if (filter === 'free') return s.connectors.some(c => c.status === 'available');
    if (filter === 'busy') return s.connectors.some(c => c.status === 'occupied');
    if (filter === 'down') return s.connectors.some(c => c.status === 'unavailable');
    return true;
  });
  if (!state) return <Page title="Станции"><Loading /></Page>;

  const connectors = own.flatMap(s => s.connectors);
  const down = connectors.filter(c => c.status === 'unavailable').length;

  return (
    <Page
      title="Станции"
      subtitle={`${own.length} ${plural(own.length, ['станция', 'станции', 'станций'])} вашей сети · выручка и загрузка за 30 дней`}
      actions={
        <span className="flex flex-wrap gap-2">
          <StickerButton stations={shown} fileName="voli-qr-stickers.pdf" label={shown.length === own.length ? 'Все наклейки QR' : `Наклейки QR · ${shown.length}`} />
          <button onClick={() => setImporting(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"><Upload size={15} />Загрузить файлом</button>
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600"><Plus size={15} />Добавить станцию</button>
        </span>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Станции" value={own.length} sub={`${new Set(own.map(s => s.city)).size} ${plural(new Set(own.map(s => s.city)).size, ['город', 'города', 'городов'])}`} icon={<MapPin size={14} />} tone="sky" />
        <Kpi label="Разъёмы" value={connectors.length} sub={`${connectors.filter(c => c.status === 'available').length} свободно`} icon={<PlugZap size={14} />} tone="emerald" />
        <Kpi label="Заряжают" value={connectors.filter(c => c.status === 'occupied').length} sub="прямо сейчас" icon={<Zap size={14} />} tone="amber" />
        <Kpi label="Недоступны" value={down} sub={down ? 'проверьте оповещения' : 'всё в работе'} icon={<AlertTriangle size={14} />} tone={down ? 'red' : 'slate'} />
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <SearchBox value={query} onChange={setQuery} placeholder="Название, город или адрес" />
          <Segmented value={filter} onChange={setFilter} options={[{ id: 'all', label: 'Все' }, { id: 'free', label: 'Есть свободные' }, { id: 'busy', label: 'Заряжают' }, { id: 'down', label: 'С проблемами' }]} />
        </div>
        {shown.length === 0 ? (
          <Empty text="Станций по этим условиям нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2.5 font-semibold">Станция</th>
                  <th className="px-5 py-2.5 font-semibold">Разъёмы</th>
                  <th className="px-5 py-2.5 font-semibold">OCPP</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Сессии</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Выручка</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Загрузка</th>
                  <th className="px-5 py-2.5 font-semibold text-right" title="Удачные запуски и время в работе за 30 дней">Надёжность</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Рейтинг</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Наклейка QR</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(s => {
                  const st = stats.get(s.id);
                  const ocpp = s.ocpp;
                  return (
                    <tr key={s.id} onClick={() => onOpen(s.id)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800">{s.name}</p>
                        <p className="text-[11px] text-slate-400">{s.city} · {s.address} · {s.hours}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex flex-wrap gap-1">
                          {s.connectors.map(c => (
                            <span key={c.id} title={`${c.type} · ${c.status}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-50 text-[11px] text-slate-600">
                              <span className={`w-1.5 h-1.5 rounded-full ${DOT[c.status]}`} />{c.type} {c.power}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-5 py-3">{ocpp?.online ? <Pill tone="green">На связи</Pill> : ocpp?.awaiting ? <Pill tone="amber">Ждёт подключения</Pill> : <Pill tone="slate">Демо-данные</Pill>}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{st ? num(st.sessions) : '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">{st ? money(st.revenue) : '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{st ? `${num(st.utilization, 1)}%` : '—'}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold ${!s.reliability ? 'text-slate-400' : s.reliability.score >= 95 ? 'text-emerald-700' : s.reliability.score >= 85 ? 'text-amber-700' : 'text-red-600'}`}>{s.reliability ? `${num(s.reliability.score, 1)}%` : '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{s.reviews ? `★ ${num(s.rating, 1)}` : 'нет отзывов'}</td>
                      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <StickerButton stations={[s]} fileName={`qr-${s.id}.pdf`} compact icon={<QrCode size={15} />} label={`Наклейка QR · ${s.name}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <AddStation onClose={() => setAdding(false)} onCreated={() => { void refresh(); void reload(); }} />}
      {importing && <ImportStations onClose={() => setImporting(false)} onDone={() => { void refresh(); void reload(); }} />}
    </Page>
  );
}
