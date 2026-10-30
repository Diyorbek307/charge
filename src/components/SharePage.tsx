import { useEffect, useState } from 'react';
import { BatteryCharging, CheckCircle, Clock, MapPin } from 'lucide-react';
import { LogoMark } from '../landing/Logo';
import { API_ORIGIN } from '../lib/site';

interface Shared {
  status: 'active' | 'completed' | 'failed';
  station: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  connector: string;
  start: string;
  end: string | null;
  energy: number;
  progress: number | null;
  readyAt: string | null;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

/**
 * What a driver shares with family or colleagues: where the car charges and
 * when it will be ready. Opens without signing in; shows no name and no money.
 */
export default function SharePage({ token }: { token: string }) {
  const [data, setData] = useState<Shared | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch(`${API_ORIGIN}/api/share/${encodeURIComponent(token)}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('gone'))))
        .then((d: Shared) => !stop && setData(d))
        .catch(() => !stop && setGone(true));
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [token]);

  return (
    <div className="min-h-full bg-[#f5f5f5] flex flex-col items-center px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <LogoMark size={32} />
        <span className="font-bold text-slate-900"><span className="text-[#8a5b00]">V</span>oli</span>
      </div>
      <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-100 p-5 space-y-4 shadow-sm">
        {gone ? (
          <p className="text-center text-slate-600 py-6">Ссылка больше не действует</p>
        ) : !data ? (
          <p className="text-center text-slate-400 py-6">Загружаем…</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl grid place-items-center ${data.status === 'active' ? 'bg-[#FFC83D] text-[#111]' : 'bg-emerald-50 text-emerald-600'}`}>
                {data.status === 'active' ? <BatteryCharging size={22} /> : <CheckCircle size={22} />}
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{data.status === 'active' ? 'Машина заряжается' : 'Зарядка завершена'}</p>
                <p className="text-sm text-slate-500">{data.status === 'active' ? `с ${clock(data.start)}` : data.end ? `в ${clock(data.end)}` : ''}</p>
              </div>
            </div>
            {data.progress !== null && data.status === 'active' && (
              <div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-[#FFC83D] transition-all" style={{ width: `${data.progress}%` }} />
                </div>
                <p className="text-xs text-slate-500 mt-1">{`${data.progress}% от цели · ${data.energy} кВт·ч`}</p>
              </div>
            )}
            {data.readyAt && data.status === 'active' && (
              <p className="flex items-center gap-2 text-base font-semibold text-slate-900"><Clock size={18} className="text-[#8a5b00]" />{`Будет готова к ${clock(data.readyAt)}`}</p>
            )}
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">{data.station}</p>
              {data.address && <p className="text-sm text-slate-500 flex items-start gap-1 mt-0.5"><MapPin size={14} className="mt-0.5 shrink-0" />{data.address}</p>}
              <p className="text-xs text-slate-400 mt-1">{data.connector}</p>
            </div>
          </>
        )}
        <a href="/?portal=driver" className="block text-center w-full py-3 rounded-2xl bg-[#111] text-white font-semibold text-sm">Открыть Voli</a>
      </div>
      <p className="text-xs text-slate-400 mt-4 text-center max-w-xs">Страница обновляется сама. Имя водителя и сумма здесь не показываются.</p>
    </div>
  );
}
