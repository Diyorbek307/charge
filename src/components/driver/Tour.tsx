import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react';

/** One stop of the tour: the element it points at (data-tour) and what to say. */
const STOPS = [
  { id: 'wallet', title: 'Ваш баланс', text: 'Нажмите, чтобы пополнить через Payme, Click, Uzum или Humo. Бонусы видны здесь же.' },
  { id: 'search', title: 'Поиск станции', text: 'Название, адрес или улица. Результаты — сразу, с расстоянием по дороге.' },
  { id: 'networks', title: 'Сети-партнёры', text: 'Одно нажатие — и на карте только станции выбранной сети.' },
  { id: 'filters', title: 'Фильтры', text: 'Разъём, мощность, свободные сейчас, кафе и удобства рядом.' },
  { id: 'legend', title: 'Что значат значки', text: 'Зелёный — есть свободные, красный — заняты, жёлтый ярлык — скидка сети.' },
  { id: 'locate', title: 'Где я', text: 'Вернёт карту к вам. Расстояние и время до станций считаются по дорогам.' },
  { id: 'qr', title: 'Главная кнопка', text: 'Наведите камеру на QR-код станции — зарядка начнётся за пару секунд.' },
  { id: 'tab-charging', title: 'Зарядка', text: 'Текущая зарядка, история и чеки, поездки по трассе и здоровье батареи.' },
  { id: 'tab-deals', title: 'Скидки', text: 'Акции сетей, ночные цены и предложения партнёров рядом со станциями.' },
  { id: 'tab-profile', title: 'Профиль', text: 'Автомобиль, награды, кошелёк, безопасность, поддержка и настройки.' },
];

interface Box { top: number; left: number; width: number; height: number; radius: number }

/**
 * The one-time walk over the map after the first sign-in: the screen dims and
 * a lit window glides from one control to the next, with a card saying what
 * it does. Controls the admin switched off are simply not on the way.
 */
export default function Tour({ root, onDone }: { root: RefObject<HTMLElement | null>; onDone: () => void }) {
  const [stops, setStops] = useState<typeof STOPS>([]);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const finale = stops.length > 0 && i === stops.length;
  const stop = stops[i];

  // Only what is on screen now: no wallet before sign-in, no SOS when it is off.
  useEffect(() => {
    const t = setTimeout(() => setStops(STOPS.filter(s => root.current?.querySelector(`[data-tour="${s.id}"]`))), 450);
    return () => clearTimeout(t);
  }, [root]);

  useLayoutEffect(() => {
    if (!stop) return;
    const measure = () => {
      const el = root.current?.querySelector<HTMLElement>(`[data-tour="${stop.id}"]`);
      const frame = root.current?.getBoundingClientRect();
      if (!el || !frame) return setBox(null);
      const r = el.getBoundingClientRect();
      const pad = 6;
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14;
      setBox({ top: r.top - frame.top - pad, left: r.left - frame.left - pad, width: r.width + pad * 2, height: r.height + pad * 2, radius: radius + pad });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [stop, root]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI(n => Math.min(n + 1, stops.length));
      if (e.key === 'ArrowLeft') setI(n => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone, stops.length]);

  if (!stops.length) return null;
  const frameH = root.current?.clientHeight ?? 800;
  // The card goes where there is room: under a control in the top half, above one lower down.
  const below = box ? box.top + box.height / 2 < frameH / 2 : false;

  return (
    <div className="absolute inset-0 z-[9998]" role="dialog" aria-modal="true" aria-label="Обучение">
      {/* The dim with a window cut in it; a mask paints reliably where a huge box-shadow does not. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none pg-fr-step" aria-hidden="true">
        <defs>
          <mask id="pg-tour-cut">
            <rect width="100%" height="100%" fill="#fff" />
            {box && !finale && <rect className="pg-tour-cut" x={box.left} y={box.top} width={box.width} height={box.height} rx={box.radius} fill="#000" style={{ x: box.left, y: box.top, width: box.width, height: box.height, rx: box.radius } as CSSProperties} />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(10,10,12,0.72)" mask="url(#pg-tour-cut)" />
      </svg>
      {box && !finale && <div className="pg-tour-hole absolute pointer-events-none" style={{ top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: box.radius }} />}
      {/* Taps on the dimmed screen do not reach the map under it. */}
      <div className="absolute inset-0" onClick={() => setI(n => Math.min(n + 1, stops.length))} />

      {finale ? (
        <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 bg-white rounded-[28px] p-6 text-center shadow-2xl pg-fr-pop">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFC83D] text-[#111] grid place-items-center mb-4"><PartyPopper size={30} /></div>
          <h2 className="text-xl font-extrabold text-[#111]">Всё готово!</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">Обучение можно пройти ещё раз в «Профиль → Настройки». Удачной дороги ⚡</p>
          <button onClick={onDone} className="mt-5 w-full h-12 rounded-2xl bg-[#FFC83D] text-[#111] font-bold">К карте</button>
        </div>
      ) : (
        stop && (
          <div key={stop.id} className="pg-tour-card absolute inset-x-4 bg-white rounded-3xl p-4 shadow-2xl pg-reveal"
            style={box ? (below ? { top: box.top + box.height + 14 } : { bottom: frameH - box.top + 14 }) : { top: '40%' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-[#8A5B00] tabular-nums">{`${i + 1} из ${stops.length}`}</span>
              <button onClick={onDone} className="text-xs font-semibold text-slate-400 px-2 py-1 rounded-lg hover:bg-slate-100">Пропустить обучение</button>
            </div>
            <h2 className="text-base font-extrabold text-[#111]">{stop.title}</h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{stop.text}</p>
            <div className="flex items-center gap-2 mt-3.5">
              <button onClick={() => setI(n => Math.max(n - 1, 0))} disabled={i === 0} aria-label="Назад" className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 grid place-items-center disabled:opacity-30"><ChevronLeft size={18} /></button>
              <button onClick={() => setI(n => n + 1)} className="flex-1 h-11 rounded-2xl bg-[#111] text-white font-bold text-sm flex items-center justify-center gap-1.5">
                {i === stops.length - 1 ? 'Завершить' : 'Дальше'}<ChevronRight size={16} />
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
