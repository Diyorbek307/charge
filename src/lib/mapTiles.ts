/**
 * The basemap every map in the app draws, toned down so our pins stand out.
 *
 * Before launch, set VITE_MAP_TILES (and VITE_MAP_ATTRIBUTION) to a tile
 * provider under a commercial plan — MapTiler, Stadia, Yandex or Google under
 * their terms. Their tiles must not be taken without a key and a contract.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const MAP_TILES = env.VITE_MAP_TILES || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION =
  env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** OpenStreetMap's own style is loud; calmed down, our pins read first. A provider's own style needs no filter. */
export const MAP_TILE_CLASS = env.VITE_MAP_TILES ? '' : 'pg-tiles';
