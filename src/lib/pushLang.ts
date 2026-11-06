/**
 * The app's language for the server, so notifications arrive in it
 * (server/phrases.js translates them). Sent with every push registration
 * and again when the driver switches language.
 */
export type PushLang = 'ru' | 'uz' | 'en';

export function appLang(): PushLang {
  try {
    const stored = localStorage.getItem('oc-lang');
    if (stored === 'ru' || stored === 'uz' || stored === 'en') return stored;
  } catch {
    /* private mode */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '').slice(0, 2).toLowerCase();
  return nav === 'uz' || nav === 'en' ? nav : 'ru';
}

/** Only for a driver signed in on this device; nothing to tell otherwise. */
export function tellPushLang(lang: PushLang) {
  void (async () => {
    const [{ tokenStore, authHeaders }, { API_ORIGIN }] = await Promise.all([import('./api'), import('./site')]);
    if (!tokenStore.has('driver')) return;
    await fetch(`${API_ORIGIN}/api/push/lang`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders('driver') },
      body: JSON.stringify({ lang }),
    });
  })().catch(() => {});
}
