import { useEffect, useState } from 'react';
import { Wallet, Zap, MapPin } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { useLiveStations } from '../../lib/live';
import { greeted } from '../../lib/greeting';

const partOfDay = () => {
  const h = new Date(Date.now() + 5 * 3600_000).getUTCHours(); // Tashkent
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
};
const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;

/**
 * Right after the code is accepted: "Добрый вечер, Мадина", the car, and
 * three things worth knowing — the wallet, the last charge, what is free
 * now. It holds a moment, then the app opens through it. A tap skips it.
 */
export default function Greeting({ onDone }: { onDone: () => void }) {
  const { sessions, state } = useSync();
  const me = sessions.driver;
  const stations = useLiveStations();
  const [leaving, setLeaving] = useState(false);

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    greeted();
    setTimeout(onDone, 520);
  };
  useEffect(() => {
    const t = setTimeout(close, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = (me?.name ?? '').split(' ')[0];
  const car = me?.car ? `${me.car.brand} ${me.car.model}` : null;
  const balance = (me && state?.wallets[me.id]?.balance) ?? 0;
  const last = (state?.sessions ?? []).filter(s => s.userId === me?.id && s.status === 'completed').sort((a, b) => b.start.localeCompare(a.start))[0];
  const free = stations.reduce((n, st) => n + st.connectors.filter(c => c.status === 'available').length, 0);
  const tiles = [
    { icon: <Wallet size={15} />, value: sum(balance), label: 'на кошельке' },
    { icon: <Zap size={15} />, value: last ? `${last.energy} кВт·ч` : '—', label: last ? 'последняя зарядка' : 'зарядок пока нет' },
    { icon: <MapPin size={15} />, value: String(free), label: 'разъёмов свободно' },
  ];

  return (
    <div onClick={close} role="status" aria-live="polite"
      className={`absolute inset-0 z-[10002] flex flex-col text-white overflow-hidden cursor-pointer ${leaving ? 'gr-out' : ''}`}
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a2208 0%, #111 45%, #070707 100%)', fontFamily: 'Inter, sans-serif' }}>
      <div className="px-7 pt-[18%]">
        <p className="text-white/60 text-lg font-semibold gr-in" style={{ animationDelay: '.05s' }}>{`${partOfDay()},`}</p>
        <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight gr-in" style={{ animationDelay: '.15s' }}>
          {first || 'водитель'}<span className="text-[#FFC83D]">.</span>
        </h1>
        {car && <p className="mt-1 text-white/50 text-sm gr-in" data-no-translate style={{ animationDelay: '.25s' }}>{car}</p>}
      </div>

      {/* The car drives in from the right and settles, a charge line running under it */}
      <div className="relative mt-8 mx-auto w-[88%] gr-car" aria-hidden="true">
        <svg viewBox="0 0 320 120" className="w-full block" style={{ filter: 'drop-shadow(0 0 14px rgba(255,200,61,.35))' }}>
          <path d="M14 86 C12 76 22 68 44 65 L86 60 C106 42 134 30 172 28 C206 27 232 36 258 54 L292 60 C306 63 312 70 311 80 L310 88 C309 92 306 94 302 94 L284 94 A21 21 0 0 0 242 94 L96 94 A21 21 0 0 0 54 94 L22 94 C17 94 14 91 14 86 Z" fill="rgba(255,200,61,.10)" stroke="#FFD66B" strokeWidth="1.8" />
          <path d="M98 60 C116 46 140 38 170 37 C196 37 216 43 238 57 Z" fill="rgba(0,0,0,.35)" stroke="#FFD66B" strokeOpacity=".55" strokeWidth="1.3" />
          <path d="M290 66 L306 70" stroke="#FFF3C4" strokeWidth="2.6" strokeLinecap="round" />
          {[75, 263].map(x => (
            <g key={x}>
              <circle cx={x} cy="96" r="17" fill="#0d0d0d" stroke="#FFD66B" strokeOpacity=".8" strokeWidth="1.8" />
              <circle cx={x} cy="96" r="7" fill="none" stroke="#FFD66B" strokeOpacity=".5" strokeWidth="1.2" className="gr-wheel" style={{ transformOrigin: `${x}px 96px` }} />
            </g>
          ))}
        </svg>
        <div className="mt-2 h-[3px] rounded-full overflow-hidden bg-white/10">
          <div className="h-full bg-[#FFC83D] gr-line" style={{ boxShadow: '0 0 10px rgba(255,200,61,.8)' }} />
        </div>
      </div>

      <div className="mt-auto px-5 pb-10 grid grid-cols-3 gap-2">
        {tiles.map((t, i) => (
          <div key={t.label} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-3 gr-in" style={{ animationDelay: `${0.55 + i * 0.1}s` }}>
            <span className="text-[#FFC83D]">{t.icon}</span>
            <p className="mt-1.5 text-[15px] font-bold tabular-nums leading-tight">{t.value}</p>
            <p className="text-[11px] text-white/50 leading-tight mt-0.5">{t.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
