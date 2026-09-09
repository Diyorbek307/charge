import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

function readTheme(): boolean {
  try {
    return localStorage.getItem('oc-theme') === 'dark';
  } catch {
    return false;
  }
}

/**
 * Theme switch styled for the dashboards' dark sidebars. Writes the same key
 * the app shell reads and broadcasts `oc-theme-change`, so the root `.dark`
 * class flips even though this control lives deep inside a portal.
 */
export default function SidebarThemeToggle() {
  const [dark, setDark] = useState(readTheme);

  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ dark: boolean }>).detail?.dark;
      if (typeof next === 'boolean') setDark(next);
    };
    window.addEventListener('oc-theme-change', onChange);
    return () => window.removeEventListener('oc-theme-change', onChange);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem('oc-theme', next ? 'dark' : 'light');
    } catch {
      /* private mode — the event still updates this session */
    }
    window.dispatchEvent(new CustomEvent('oc-theme-change', { detail: { dark: next } }));
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors"
      style={{ color: 'rgba(148,163,184,0.45)' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '';
        e.currentTarget.style.color = 'rgba(148,163,184,0.45)';
      }}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
      {dark ? 'Светлая тема' : 'Тёмная тема'}
    </button>
  );
}
