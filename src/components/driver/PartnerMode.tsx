import { useEffect, useMemo, useState } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, X, ExternalLink, Zap } from 'lucide-react';
import type { PartnerSite } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { km, fmtKm } from '../../lib/geo';
import { plural } from '../../lib/analytics';
import { networkLook } from '../../lib/promos';
import { NetworkBadge } from './NetworkBadge';

/**
 * Stations of networks that are on the map only (Spectre for now, server/partnerMap.js):
 * Voli shows where they are, and the driver charges in the network's own app.
 */
export function usePartnerSites(on: boolean) {
  const { actions } = useSync();
  const [list, setList] = useState<PartnerSite[]>([]);
  useEffect(() => {
    if (!on) return;
    let live = true;
    actions.partnerMap().then(r => live && setList(r.sites)).catch(() => {});
    return () => {
      live = false;
    };
  }, [actions, on]);
  return list;
}

const pinCache = new Map<string, L.DivIcon>();
function partnerIcon(site: PartnerSite, selected: boolean) {
  const key = `${site.operator}-${site.chargers.length > 1 ? site.chargers.length : 1}-${selected}`;
  let icon = pinCache.get(key);
  if (!icon) {
    const { color } = networkLook(site.operator);
    const size = selected ? 38 : 28;
    const count = site.chargers.length > 1 ? `<span style="position:absolute;right:-6px;top:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#111;color:#fff;font:800 10px/16px Inter,sans-serif;text-align:center;border:1.5px solid #fff">${site.chargers.length}</span>` : '';
    const html = `<div style="position:relative;width:${size}px;height:${size}px;border-radius:30%;background:${color};border:2.5px solid #fff;box-shadow:0 3px 10px rgba(15,23,42,.28)${selected ? `,0 0 0 6px ${color}33` : ''};display:grid;place-items:center;opacity:${selected ? 1 : 0.92}">`
      + `<svg width="${size / 2}" height="${size / 2}" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>${count}</div>`;
    icon = L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    pinCache.set(key, icon);
  }
  return icon;
}

/** The partner stations in view, at most 120 nearest the centre, so the map stays quick. */
export function PartnerMarkers({ sites, selected, onSelect }: { sites: PartnerSite[]; selected: PartnerSite | null; onSelect: (s: PartnerSite) => void }) {
  const map = useMap();
  const [view, setView] = useState(() => ({ b: map.getBounds().pad(0.3), c: map.getCenter(), z: map.getZoom() }));
  useMapEvents({ moveend: () => setView({ b: map.getBounds().pad(0.3), c: map.getCenter(), z: map.getZoom() }) });
  useEffect(() => {
    if (!selected) return;
    const zoom = Math.max(map.getZoom(), 14);
    const p = map.project([selected.lat, selected.lng], zoom).add([0, map.getSize().y * 0.16]);
    map.flyTo(map.unproject(p, zoom), zoom, { duration: 0.6 });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (view.z < 9 ? [] : sites
    .filter(s => view.b.contains([s.lat, s.lng]))
    .map(s => ({ s, d: (s.lat - view.c.lat) ** 2 + (s.lng - view.c.lng) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 120)
    .map(x => x.s)), [sites, view]);
  return (
    <>
      {shown.map(s => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={partnerIcon(s, s.id === selected?.id)} zIndexOffset={s.id === selected?.id ? 1000 : -100}
          eventHandlers={{ click: () => onSelect(s) }} />
      ))}
    </>
  );
}

const powerText = (kw: number | null) => (kw ? `${kw} кВт` : 'мощность не указана');

/** The card for a partner station: where it is, its chargers, and its own app. */
export function PartnerSheet({ site, here, onClose }: { site: PartnerSite; here: { lat: number; lng: number } | null; onClose: () => void }) {
  const d = here ? km(here, site) : null;
  const fast = site.chargers.filter(c => !c.hybrid).length;
  const slow = site.chargers.length - fast;
  return (
    <div className="px-3 pg-reveal">
      <div className="flex items-start gap-3">
        <NetworkBadge name={site.operator} size={44} />
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-extrabold text-slate-900 leading-tight">{site.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{[site.operator, site.address, d !== null ? fmtKm(d) : null].filter(Boolean).join(' · ')}</p>
        </div>
        <button onClick={onClose} aria-label="Закрыть" className="w-9 h-9 rounded-xl bg-slate-100 grid place-items-center text-slate-600 shrink-0"><X size={17} /></button>
      </div>

      <div className="mt-2.5 flex gap-1.5 flex-wrap">
        <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"><Zap size={11} />{`до ${powerText(site.maxPower)}`}</span>
        {fast > 0 && <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">{`${fast} ${plural(fast, ['быстрая', 'быстрые', 'быстрых'])}`}</span>}
        {slow > 0 && <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">{`${slow} ${plural(slow, ['гибридная', 'гибридные', 'гибридных'])}`}</span>}
      </div>

      <p className="mt-2.5 rounded-2xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-[13px] text-slate-600">
        {`Станция сети ${site.operator}. Зарядка, цена и оплата — в приложении ${site.operator}.`}
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <a href={site.link} target="_blank" rel="noopener noreferrer"
          className="h-12 rounded-2xl text-white text-[15px] font-bold flex items-center justify-center gap-2" style={{ background: networkLook(site.operator).color }}>
          <ExternalLink size={16} />{`Открыть в ${site.operator}`}
        </a>
        <a href={`https://yandex.uz/maps/?rtext=~${site.lat},${site.lng}&rtt=auto`} target="_blank" rel="noopener noreferrer"
          className="h-12 rounded-2xl bg-[#111] text-white text-[15px] font-bold flex items-center justify-center gap-2">
          <Navigation size={17} className="text-[#C6F432] fill-[#C6F432]" />Маршрут
        </a>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400 text-center">{`Данные о станциях — открытый список ${site.operator}.`}</p>
    </div>
  );
}
