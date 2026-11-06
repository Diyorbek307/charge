/**
 * Hands the route to Yandex Navigator, which drivers here know: its voice,
 * traffic jams and lights. Yandex documents this link for any app to use.
 * When the navigator is not installed the page is still visible a moment
 * later, so Yandex Maps opens instead (the app or, failing that, the site).
 */
export function openInYandex(to: { lat: number; lng: number }, name?: string) {
  const lat = to.lat.toFixed(6);
  const lng = to.lng.toFixed(6);
  const app = `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
  const maps = `https://yandex.ru/maps/?rtext=~${lat}%2C${lng}&rtt=auto${name ? `&text=${encodeURIComponent(name)}` : ''}`;

  let left = false;
  const onHide = () => {
    if (document.visibilityState === 'hidden') left = true;
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    if (!left && document.visibilityState === 'visible') window.open(maps, '_blank', 'noopener');
  }, 1600);
  window.location.href = app;
}
