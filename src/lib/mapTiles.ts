/**
 * The basemap every map in the app draws.
 *
 * By default a vector style from OpenFreeMap (free, no key, open data from
 * OpenStreetMap), recoloured in BaseMap to our palette. VITE_MAP_STYLE points
 * at another MapLibre style (MapTiler, Stadia…); VITE_MAP_TILES switches to a
 * raster provider instead. Yandex or Google only under their terms, with a key.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const MAP_STYLE = env.VITE_MAP_TILES ? '' : env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron';
export const MAP_TILES = env.VITE_MAP_TILES || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION =
  env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** OpenStreetMap's own raster style is loud; calmed down, our pins read first. */
export const MAP_TILE_CLASS = env.VITE_MAP_TILES ? '' : 'pg-tiles';
