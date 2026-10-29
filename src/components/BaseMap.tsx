import { useEffect, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MAP_TILES, MAP_ATTRIBUTION, MAP_TILE_CLASS, MAP_STYLE } from '../lib/mapTiles';

/**
 * Our own warm, quiet palette on top of the vector style: paper background,
 * soft greens and blues, white streets and yellow motorways — the brand
 * colour on the roads drivers actually take.
 */
const PAINT: [string, string, string][] = [
  ['background', 'background-color', '#F5F4EF'],
  ['landuse_residential', 'fill-color', '#F0EFE9'],
  ['park', 'fill-color', '#E1EED8'],
  ['landcover_wood', 'fill-color', '#E4EFDC'],
  ['water', 'fill-color', '#CCE1EE'],
  ['waterway', 'line-color', '#B9D4E6'],
  ['building', 'fill-color', '#E9E7DF'],
  ['highway_minor', 'line-color', '#FFFFFF'],
  ['highway_major_casing', 'line-color', '#E1DED4'],
  ['highway_major_inner', 'line-color', '#FFFFFF'],
  ['highway_major_subtle', 'line-color', '#FFFFFF'],
  ['highway_motorway_casing', 'line-color', '#F2C94C'],
  ['highway_motorway_inner', 'line-color', '#FFE7A0'],
  ['highway_motorway_subtle', 'line-color', '#FFE7A0'],
  ['highway_motorway_bridge_casing', 'line-color', '#F2C94C'],
  ['highway_motorway_bridge_inner', 'line-color', '#FFE7A0'],
];

const webgl = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

/**
 * The basemap under every map in the app: a vector map (sharp at any zoom,
 * our colours) when the device has WebGL, raster tiles otherwise or when a
 * raster provider is configured.
 */
export default function BaseMap() {
  const map = useMap();
  const [raster, setRaster] = useState(() => !MAP_STYLE || !webgl());

  useEffect(() => {
    if (raster) return;
    let layer: L.Layer | null = null;
    let cancelled = false;
    // Loaded on demand: the vector engine is large and only maps need it.
    void Promise.all([import('maplibre-gl'), import('@maplibre/maplibre-gl-leaflet'), import('maplibre-gl/dist/maplibre-gl.css')])
      .then(() => {
        if (cancelled) return;
        const gl = (L as unknown as { maplibreGL: (o: object) => L.Layer & { getMaplibreMap: () => import('maplibre-gl').Map } }).maplibreGL({
          style: MAP_STYLE,
          attributionControl: false,
          interactive: false,
        });
        layer = gl;
        gl.addTo(map);
        map.attributionControl?.addAttribution('&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>');
        const m = gl.getMaplibreMap();
        m.on('error', () => undefined);
        let recoloured = false;
        const recolor = () => {
          // Once: our own paint changes fire styledata too.
          let ready = false;
          try {
            ready = !!m.getLayer('background');
          } catch {
            /* style still loading */
          }
          if (recoloured || !ready) return;
          recoloured = true;
          for (const [id, prop, value] of PAINT) {
            try {
              if (m.getLayer(id)) m.setPaintProperty(id, prop as 'fill-color', value);
            } catch {
              /* a style without this layer */
            }
          }
        };
        // The style may already be in by now; either way it gets our colours.
        recolor();
        m.on('styledata', recolor);
        m.on('idle', recolor);
      })
      .catch(() => !cancelled && setRaster(true));
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, raster]);

  return raster ? <TileLayer url={MAP_TILES} attribution={MAP_ATTRIBUTION} className={MAP_TILE_CLASS} /> : null;
}
