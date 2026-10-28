/**
 * Running as a Telegram Mini App. Telegram opens the app with signed
 * `tgWebAppData` in the URL hash; the SDK is loaded only then, so the regular
 * web app never fetches anything from telegram.org.
 */

type WebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  colorScheme?: 'light' | 'dark';
};
declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

const SDK = 'https://telegram.org/js/telegram-web-app.js';

export const inTelegram = () => typeof window !== 'undefined' && (/tgWebAppData=/.test(window.location.hash) || !!window.Telegram?.WebApp?.initData);

let loading: Promise<WebApp | null> | null = null;

/** Loads the SDK once and prepares the Mini App; null outside Telegram. */
export function telegramApp(): Promise<WebApp | null> {
  if (!inTelegram()) return Promise.resolve(null);
  if (window.Telegram?.WebApp?.initData) return Promise.resolve(window.Telegram.WebApp);
  loading ??= new Promise(resolve => {
    const s = document.createElement('script');
    s.src = SDK;
    s.async = true;
    s.onload = () => {
      const app = window.Telegram?.WebApp ?? null;
      if (app) {
        app.ready();
        app.expand();
        app.setHeaderColor?.('#ffffff');
        app.setBackgroundColor?.('#ffffff');
      }
      resolve(app);
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

/** The signed init data to send to the server, or '' outside Telegram. */
export async function telegramInitData(): Promise<string> {
  return (await telegramApp())?.initData ?? '';
}
