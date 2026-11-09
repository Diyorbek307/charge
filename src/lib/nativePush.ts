import { authHeaders } from './api';
import { API_ORIGIN, inNativeShell } from './site';
import { appLang } from './pushLang';

/**
 * Notifications in the store app, through Firebase (server/fcm.js), where
 * the web's push does not reach: an Android web view has no Web Push.
 *
 * Android only for now. On iPhone the plugin hands back an Apple token, not
 * a Firebase one; iPhone notifications come with the Apple developer account
 * (APNs key in Firebase, Firebase Messaging in the iOS project).
 */
const platform = () => (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ?? 'web';

export const nativePushAvailable = () => inNativeShell() && platform() === 'android';

let tapsWired = false;

/**
 * Asks the phone for permission (once), registers with Firebase and gives
 * the server this phone's token. Resolves to whether notifications are on.
 */
export async function enableNativePush(): Promise<boolean> {
  if (!nativePushAvailable()) return false;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;
  // The channel the server's messages name (android.notification.channel_id).
  await PushNotifications.createChannel({ id: 'voli', name: 'Voli', description: 'Зарядка, очередь, бронь и оплата', importance: 4 }).catch(() => {});

  if (!tapsWired) {
    tapsWired = true;
    // A tap on a notice opens the screen it is about.
    await PushNotifications.addListener('pushNotificationActionPerformed', a => {
      const url = (a.notification.data as { url?: string } | undefined)?.url;
      // Our own screens only: "//other.site" is another site, not a path.
      if (url && /^\/(?![/\\])/.test(url)) window.location.href = url;
    });
  }

  return new Promise(resolve => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    void PushNotifications.addListener('registration', async t => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/push/native`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders('driver') },
          body: JSON.stringify({ token: t.value, platform: 'android', lang: appLang() }),
        });
        finish(res.ok);
      } catch {
        finish(false);
      }
    });
    void PushNotifications.addListener('registrationError', () => finish(false));
    void PushNotifications.register();
    setTimeout(() => finish(false), 15_000);
  });
}

/** Whether the phone already allowed notifications to the app. */
export async function nativePushGranted() {
  if (!nativePushAvailable()) return false;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return (await PushNotifications.checkPermissions()).receive === 'granted';
}
