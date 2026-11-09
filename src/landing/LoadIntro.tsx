import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Lang } from '../lib/i18n';
import { V_BLADE, V_STROKE } from './Logo';
import './load-intro.css';

/**
 * The opening: a cable runs in and plugs into a battery, the battery charges
 * to 100 %, and the screen lifts away — about five seconds, once a visit.
 * Click or any key skips it. Only opacity, transforms and one number change,
 * so it runs smoothly on a weak phone too.
 */
const KEY = 'voli-load';
const TOTAL = 4600;
const CHARGE_FROM = 900;
const CHARGE_MS = 2900;

const STEPS: Record<Lang, string[]> = {
  ru: ['Подключаем станции', 'Ищем свободные разъёмы', 'Считаем маршрут', 'Готово к поездке'],
  uz: ['Stansiyalarni ulaymiz', 'Bo‘sh ulagichlarni qidiramiz', 'Yo‘nalishni hisoblaymiz', 'Safarga tayyor'],
  en: ['Connecting stations', 'Finding free connectors', 'Planning the route', 'Ready to go'],
};

export function loadIntroDue() {
  try {
    if (new URLSearchParams(window.location.search).has('intro')) return true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (navigator.webdriver) return false;
    return !sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export default function LoadIntro({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const steps = STEPS[lang] ?? STEPS.ru;

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
    setTimeout(onDone, 650);
  };

  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0 - CHARGE_FROM) / CHARGE_MS));
      // Fast at first, slowing near the top — like a real charge curve.
      setPct(Math.round((1 - Math.pow(1 - k, 2.2)) * 100));
      if (t - t0 < TOTAL) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', skip); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = pct >= 100 ? 3 : pct >= 66 ? 2 : pct >= 25 ? 1 : 0;

  return createPortal(
    <div className={`vi${leaving ? ' is-out' : ''}${pct >= 100 ? ' is-full' : ''}`} onClick={finish} role="presentation" aria-hidden="true">
      <div className="vi-stage">
        <svg className="vi-logo" viewBox="20 8 80 70">
          <path d={V_STROKE} className="vi-logo-stroke" />
          <path d={V_BLADE} className="vi-logo-blade" />
        </svg>

        <div className="vi-row">
          <svg className="vi-cable" viewBox="0 0 400 60" preserveAspectRatio="none">
            <path d="M0 30 C120 30 150 10 230 22 S 330 30 400 30" pathLength={1} />
          </svg>
          <div className="vi-plug"><i /><i /></div>
          <div className="vi-bat">
            <div className="vi-bat-fill" style={{ transform: `scaleX(${pct / 100})` }} />
            <svg className="vi-bat-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
            <span className="vi-bat-cap" />
          </div>
        </div>

        <p className="vi-pct"><b>{pct}</b>%</p>
        <p className="vi-step" key={step}>{steps[step]}</p>
      </div>
      <span className="vi-skip">{lang === 'en' ? 'Tap to skip' : lang === 'uz' ? 'O‘tkazish uchun bosing' : 'Нажмите, чтобы пропустить'}</span>
    </div>,
    document.body,
  );
}
