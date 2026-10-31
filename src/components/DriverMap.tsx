import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, SlidersHorizontal, Navigation, X, Wallet, List, Map as MapIcon, Clock, Info, Percent } from 'lucide-react';
import type { Station } from '../data/mockData';
import type { Promo } from '../lib/api';
import { useLiveStations } from '../lib/live';
import { useSync } from '../lib/sync';
import { locate as askLocation, samePort, openNow, km, fmtKm, useMyLocation, lastKnown, geoPermission, watchLocation, type Fix } from '../lib/geo';
import { plural } from '../lib/analytics';
import BaseMap from './BaseMap';
import { promoNow, isNight, networkLook, discounted, useDriverPromos } from '../lib/promos';
import { NetworkBadge } from './driver/NetworkBadge';
import { ChargerFriend } from './driver/Illustration';
import { V_BLADE, V_STROKE } from '../landing/Logo';

const statusColor: Record<string, string> = {
  available: '#16A34A',
  occupied: '#EF4444',
  unavailable: '#94A3B8',
  reserved: '#F59E0B',
};
const statusLabel: Record<string, string> = {
  available: 'Свободно',
  occupied: 'Занято',
  unavailable: 'Недоступно',
  reserved: 'Забронировано',
};

const CONNECTORS = [
  { id: 'all', label: 'Все' },
  { id: 'CCS2', label: 'CCS2' },
  { id: 'Type2', label: 'Type 2' },
  { id: 'GB/T DC', label: 'GB/T' },
  { id: 'CHAdeMO', label: 'CHAdeMO' },
];
const POWER = [
  { id: 'all', label: 'Все', sub: '', test: () => true },
  { id: 'ac', label: 'AC до 22 кВт', sub: 'Медленная', test: (kw: number) => kw <= 22 },
  { id: 'dc', label: 'DC от 50 кВт', sub: 'Быстрая', test: (kw: number) => kw >= 50 },
  { id: 'hpc', label: 'DC от 150 кВт', sub: 'Сверхбыстрая', test: (kw: number) => kw >= 150 },
];

const TASHKENT: [number, number] = [41.3111, 69.2797];
/** From this zoom on, each pin carries its network and free count. */
const LABEL_ZOOM = 12;
/** From this zoom on, stations in the same spot fan out instead of merging. */
const FAN_ZOOM = 16;

/**
 * Kept between visits to the map tab: the view the driver left, whether the
 * map has already framed them once, and whether the browser already asked.
 */
let lastView: { lat: number; lng: number; zoom: number } | null = null;
let framedOnce = false;
let askedOnce = false;

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// The Voli mark in the drop: the V on a white disc, its blade amber so it reads on white.
const MARK = `<svg class="pg-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#fff"/><g transform="translate(24 25) scale(.42) translate(-58.5 -44.5)"><path d="${V_STROKE}" fill="none" stroke="#111" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/><path d="${V_BLADE}" fill="#F2AE00"/></g></svg>`;
const PCT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';

const TONES = {
  free: ['#34D399', '#059669'],
  busy: ['#FB7185', '#DC2626'],
  off: ['#CBD5E1', '#94A3B8'],
  promo: ['#FFE08A', '#FF9F0A'],
} as const;

/**
 * A station pin: a glossy drop with a white rim and a shadow on the ground,
 * the Voli mark (or % for a promo), and close up a free/total badge and a chip with
 * the network and the discount. It drops in with a little bounce.
 */
type PinMotion = { anim: 'enter' | 'split' | 'change' | 'none'; delay?: number; dx?: number; dy?: number; selected?: boolean; fan?: [number, number] };
const kindOf = (s: Station, promo: Promo | null) => (promo ? 'promo' : s.status === 'unavailable' ? 'off' : freeOf(s) > 0 ? 'free' : 'busy');

function stationIcon(s: Station, promo: Promo | null, labelled: boolean, m: PinMotion = { anim: 'enter' }) {
  const free = freeOf(s);
  const total = s.connectors.length;
  const look = networkLook(s.operator);
  const kind = kindOf(s, promo);
  const [a, b] = TONES[kind];
  const tone = kind === 'free' ? '#059669' : kind === 'busy' ? '#DC2626' : '#64748B';
  const chip = labelled
    ? `<span class="pg-chip"><i style="background:${look.color}">${look.initials}</i><span class="pg-chip-name">${esc(s.operator)}</span>${promo ? `<em>${isNight(promo) ? MOON : ''}−${promo.percent}%</em>` : ''}</span>`
    : '';
  const badge = labelled ? `<span class="pg-badge"><b style="color:${promo ? tone : b}">${free}</b>/${total}</span>` : '';
  const [fx, fy] = m.fan ?? [0, 0];
  const motion = m.anim === 'none' ? '' : `pg-${m.anim}`;
  const vars = `--d:${m.delay ?? 0}ms;--dx:${m.dx ?? 0}px;--dy:${m.dy ?? 0}px;--fx:${fx}px;--fy:${fy}px`;
  const html = `<div class="pg-pin pg-pin-${kind} ${motion}${m.selected ? ' pg-selected' : ''}" style="${vars}">${chip}<div class="pg-drop">
    <svg viewBox="0 0 40 50" width="40" height="50"><defs><linearGradient id="pg-g-${kind}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <path d="M20 48C20 48 4 31 4 19a16 16 0 0 1 32 0c0 12-16 29-16 29z" fill="url(#pg-g-${kind})" stroke="#fff" stroke-width="3"/>
    <ellipse cx="14.5" cy="12" rx="6" ry="3.4" fill="#fff" opacity=".35" transform="rotate(-30 14.5 12)"/></svg>
    <span class="pg-drop-ic" style="color:${kind === 'promo' ? '#111' : '#fff'}">${promo ? PCT : MARK}</span>${badge}</div><span class="pg-ground"></span></div>`;
  return L.divIcon({ html, className: 'pg-pin-wrap', iconSize: [0, 0], iconAnchor: [0, 0] });
}

/** A group of stations: a white disc whose ring fills green with the share of free connectors. */
function clusterIcon(count: number, free: number, total: number, promo: boolean) {
  const size = count >= 10 ? 54 : 48;
  const share = total ? Math.round((free / total) * 360) : 0;
  const html = `<div class="pg-cluster" style="width:${size}px;height:${size}px;background:conic-gradient(#10B981 ${share}deg,#E4E4DD ${share}deg)">
    <div class="pg-cluster-in"><b>${count}</b><span>${free} своб.</span></div>${promo ? '<i class="pg-cluster-pct">%</i>' : ''}
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const freeOf = (s: Station) => s.connectors.filter(c => c.status === 'available').length;
const opId = (s: Station) => (s as Station & { operatorId?: string }).operatorId;

/**
 * Groups stations that would overlap on screen at the current zoom into one
 * bubble; tapping a bubble zooms in until they separate. Small enough that a
 * clustering library is not worth the dependency.
 */
function ClusteredMarkers({ stations, promos, onSelect, selectedId }: { stations: Station[]; promos: Promo[]; onSelect: (s: Station) => void; selectedId: string | null }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()), moveend: () => setZoom(map.getZoom()) });
  const labelled = zoom >= LABEL_ZOOM;
  const fanning = zoom >= FAN_ZOOM;
  // Icons are reused while a pin looks the same: a fresh icon would replay its drop-in on every live update.
  const pins = useRef(new Map<string, { look: string; icon: L.DivIcon }>());
  const bubbles = useRef(new Map<string, { look: string; icon: L.DivIcon }>());
  // The bubble each station sat in last time, so on zoom-in it flies out of it.
  const wasIn = useRef(new Map<string, L.LatLng>());
  const born = useRef(Date.now());

  const groups = useMemo(() => {
    const out: { stations: Station[]; lat: number; lng: number }[] = [];
    // Labelled pins are wider, so they need more room before they separate; fanned ones only need not to touch.
    const radius = fanning ? 30 : labelled ? 58 : 44;
    for (const s of stations) {
      const p = map.project([s.geoLat, s.geoLng], zoom);
      const g = out.find(c => map.project([c.lat, c.lng], zoom).distanceTo(p) < radius);
      if (g) {
        g.stations.push(s);
        g.lat = g.stations.reduce((n, x) => n + x.geoLat, 0) / g.stations.length;
        g.lng = g.stations.reduce((n, x) => n + x.geoLng, 0) / g.stations.length;
      } else out.push({ stations: [s], lat: s.geoLat, lng: s.geoLng });
    }
    return out;
  }, [stations, zoom, map, labelled, fanning]);

  const center = map.project(map.getCenter(), zoom);
  const shown = new Set<string>();
  const markers = groups.flatMap(g => {
    if (g.stations.length === 1 || fanning) {
      return g.stations.map((s, i) => {
        shown.add(s.id);
        const promo = promoNow({ id: s.id, operatorId: opId(s) }, promos);
        const n = g.stations.length;
        // Stations in one spot stand in a small ring around it, each still pointing near its place.
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        const fan: [number, number] = n > 1 ? [Math.round(Math.cos(a) * (22 + n * 4)), Math.round(Math.sin(a) * (22 + n * 4))] : [0, 0];
        const selected = s.id === selectedId;
        const state = `${kindOf(s, promo)}|${freeOf(s)}`;
        const look = `${state}|${s.connectors.length}|${promo ? `${promo.id}${promo.percent}${isNight(promo)}` : ''}|${labelled}|${selected}|${fan}`;
        const prev = pins.current.get(s.id);
        let icon = prev?.icon;
        if (!prev || prev.look !== look) {
          const motion: PinMotion = { anim: 'none', selected, fan };
          if (!prev) {
            const own = map.project([s.geoLat, s.geoLng], zoom);
            const from = wasIn.current.get(s.id);
            const f = from ? map.project(from, zoom) : null;
            if (f && f.distanceTo(own) > 4) Object.assign(motion, { anim: 'split', dx: Math.round(f.x - own.x), dy: Math.round(f.y - own.y) });
            // The first pins ripple out from the middle of the map.
            else Object.assign(motion, { anim: 'enter', delay: Date.now() - born.current < 1500 ? Math.min(520, Math.round(own.distanceTo(center) * 0.9)) : 0 });
          } else if (prev.look.split('|').slice(0, 2).join('|') !== state) motion.anim = 'change';
          icon = stationIcon(s, promo, labelled, motion);
          pins.current.set(s.id, { look, icon });
        }
        return (
          <Marker
            key={s.id}
            position={[s.geoLat, s.geoLng]}
            icon={icon!}
            zIndexOffset={selected ? 1000 : 0}
            title={`${s.name} · ${s.operator} · ${freeOf(s)}/${s.connectors.length} свободно${promo ? ` · ${promo.title}` : ''}`}
            eventHandlers={{ click: () => onSelect(s) }}
          />
        );
      });
    }
    const key = g.stations.map(s => s.id).join('-');
    const free = g.stations.reduce((n, s) => n + freeOf(s), 0);
    const total = g.stations.reduce((n, s) => n + s.connectors.length, 0);
    const promo = g.stations.some(s => promoNow({ id: s.id, operatorId: opId(s) }, promos));
    const look = `${free}|${total}|${promo}`;
    let bubble = bubbles.current.get(key);
    if (!bubble || bubble.look !== look) {
      bubble = { look, icon: clusterIcon(g.stations.length, free, total, promo) };
      bubbles.current.set(key, bubble);
    }
    return [
      <Marker
        key={key}
        position={[g.lat, g.lng]}
        icon={bubble.icon}
        title={`${g.stations.length} ${plural(g.stations.length, ['станция', 'станции', 'станций'])}`}
        eventHandlers={{
          click: () => map.flyToBounds(L.latLngBounds(g.stations.map(s => [s.geoLat, s.geoLng] as [number, number])), { padding: [70, 70], maxZoom: FAN_ZOOM, duration: 0.6 }),
        }}
      />,
    ];
  });
  // A pin that left the map enters afresh next time; remember which bubble each station is in now.
  for (const id of [...pins.current.keys()]) if (!shown.has(id)) pins.current.delete(id);
  for (const g of groups) {
    for (const s of g.stations) {
      if (g.stations.length > 1 && !fanning) wasIn.current.set(s.id, L.latLng(g.lat, g.lng));
      else wasIn.current.delete(s.id);
    }
  }
  if (bubbles.current.size > 200) bubbles.current.clear();

  return <>{markers}</>;
}

/**
 * The open station's pin stands in the strip of map above its card, not
 * under it, and the map comes close enough to see the entrance.
 */
function FocusStation({ station }: { station: Station | null }) {
  const map = useMap();
  useEffect(() => {
    if (!station) return;
    const box = map.getContainer();
    const h = box.clientHeight;
    const sheet = box.closest('.pg-app')?.querySelector<HTMLElement>('[data-sheet]');
    // The card grows as its blocks load, so plan for its tallest.
    const top = Math.min(sheet?.offsetTop ?? h * 0.4, h * 0.2);
    // Below the "no signal" banner when it is up.
    const banner = box.closest('.pg-app')?.querySelector<HTMLElement>('[data-offline-banner]');
    const below = banner ? banner.offsetTop + banner.offsetHeight + 72 : 0;
    const wantY = Math.max(70, below, top * 0.55 + 24);
    const zoom = Math.max(map.getZoom(), 15);
    const at = map.project([station.geoLat, station.geoLng], zoom).add([0, h / 2 - wantY]);
    map.flyTo(map.unproject(at, zoom), zoom, { duration: 0.75, easeLinearity: 0.2 });
    // Only when another station is opened, not on every live update of this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.id, map]);
  return null;
}

/**
 * The driver's dot glides to each new fix instead of jumping, and carries
 * the circle of how sure the fix is.
 */
function MeMarker({ fix }: { fix: Fix | null }) {
  const map = useMap();
  const dot = useRef<L.Marker | null>(null);
  const ring = useRef<L.Circle | null>(null);
  useEffect(() => () => {
    dot.current?.remove();
    ring.current?.remove();
  }, []);
  useEffect(() => {
    if (!fix) return;
    const to = L.latLng(fix.lat, fix.lng);
    const radius = fix.accuracy && fix.accuracy < 1500 ? fix.accuracy : 0;
    const icon = meIcon(fix.heading);
    if (!dot.current || !ring.current) {
      ring.current = L.circle(to, { radius, interactive: false, color: '#2563EB', weight: 1, opacity: 0.25, fillColor: '#3B82F6', fillOpacity: 0.08 }).addTo(map);
      dot.current = L.marker(to, { icon, interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map);
      return;
    }
    const m = dot.current;
    const c = ring.current;
    if (m.options.icon !== icon) m.setIcon(icon);
    c.setRadius(radius);
    const from = m.getLatLng();
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 800);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = L.latLng(from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e);
      m.setLatLng(p);
      c.setLatLng(p);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fix, map]);
  return null;
}

/** Remembers where the driver left the map, and whether they moved it themselves. */
function ViewKeeper({ onTouch }: { onTouch: () => void }) {
  const map = useMap();
  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      lastView = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
    },
    dragstart: onTouch,
  });
  return null;
}

/** "You are here": a blue dot that breathes, its accuracy, and a beam the way the car is heading. */
const meIcons = new Map<string, L.DivIcon>();
function meIcon(heading: number | null | undefined) {
  const key = heading == null ? 'still' : String(Math.round(heading / 10) * 10);
  let icon = meIcons.get(key);
  if (!icon) {
    const beam = heading == null ? '' : `<span class="pg-me-beam" style="transform:rotate(${key}deg)"></span>`;
    icon = L.divIcon({ html: `<div class="pg-me-wrap">${beam}<span class="pg-me-halo"></span><span class="pg-me"></span></div>`, className: 'pg-me-icon', iconSize: [20, 20], iconAnchor: [10, 10] });
    meIcons.set(key, icon);
  }
  return icon;
}

type Target = { lat: number; lng: number; zoom: number; n: number; around?: [number, number][] };

/** Lets the overlay controls move the map. */
function MapBridge({ target }: { target: Target | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.around?.length) {
      // Me and the nearest stations, clear of the search sheet at the bottom.
      map.flyToBounds(L.latLngBounds([[target.lat, target.lng], ...target.around]), { paddingTopLeft: [48, 110], paddingBottomRight: [48, 300], maxZoom: 15, duration: 1.1 });
    } else map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 });
  }, [target, map]);
  return null;
}

const chip = (on: boolean, tone: 'dark' | 'green' | 'yellow' = 'dark') =>
  `shrink-0 h-9 px-3.5 rounded-2xl text-[13px] font-semibold border transition-colors inline-flex items-center gap-1.5 ${
    on
      ? tone === 'green' ? 'bg-emerald-600 text-white border-emerald-600' : tone === 'yellow' ? 'bg-[#FFC83D] text-[#111] border-[#FFC83D]' : 'bg-[#111] text-white border-[#111]'
      : 'bg-slate-50 text-slate-700 border-slate-100 hover:bg-slate-100'
  }`;

export default function DriverMap({ onSelectStation, onOpenWallet, onSos, hideChrome = false, selected = null, autoLocate = true }: { onSelectStation: (s: Station) => void; onOpenWallet?: () => void; onSos?: () => void; hideChrome?: boolean; selected?: Station | null; autoLocate?: boolean }) {
  const stations = useLiveStations();
  const [status, setStatus] = useState('all');
  const [connector, setConnector] = useState('all');
  const [power, setPower] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const here = useMyLocation();
  // The map opens where the driver was: the view they left, else their last position, else Tashkent.
  const [start] = useState(() => {
    if (lastView) return lastView;
    const p = here ?? lastKnown();
    return p ? { lat: p.lat, lng: p.lng, zoom: 13 } : { lat: TASHKENT[0], lng: TASHKENT[1], zoom: 11 };
  });
  const touched = useRef(false);
  const stopWatch = useRef<(() => void) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState('');
  const [legend, setLegend] = useState(false);

  // The driver's own car, when they have told us: "only stations that fit my car".
  const { sessions, state } = useSync();
  const promos = useDriverPromos();
  const car = sessions.driver?.car ?? null;
  const balance = (sessions.driver && state?.wallets[sessions.driver.id]?.balance) ?? 0;
  const bonus = state?.rewards?.bonus.balance ?? 0;
  const sosOn = state?.platform?.features.sos !== false;
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [network, setNetwork] = useState('all');
  // Comfort filters and the list over the map (the map always stays underneath).
  const [openOnly, setOpenOnly] = useState(false);
  const [amen, setAmen] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const toggleAmen = (a: string) => setAmen(v => (v.includes(a) ? v.filter(x => x !== a) : [...v, a]));

  // Networks that have stations on the map, biggest first.
  const networks = useMemo(() => {
    const count = new Map<string, { id: string; name: string; n: number }>();
    for (const s of stations) {
      const id = opId(s) ?? s.operator;
      const cur = count.get(id) ?? { id, name: s.operator, n: 0 };
      cur.n++;
      count.set(id, cur);
    }
    return [...count.values()].sort((a, b) => b.n - a.n);
  }, [stations]);

  const powerTest = POWER.find(p => p.id === power)!.test;
  const filtered = stations.filter(s => {
    if (status !== 'all' && s.status !== status) return false;
    if (network !== 'all' && (opId(s) ?? s.operator) !== network) return false;
    const conns = s.connectors.filter(
      c =>
        (connector === 'all' || samePort(c.type, connector)) &&
        powerTest(c.power) &&
        (!onlyMine || !car || samePort(c.type, car.port) || (car.port === 'CCS2' && samePort(c.type, 'Type 2'))) &&
        (!onlyFree || c.status === 'available'),
    );
    if (!conns.length) return false;
    if (openOnly && !openNow(s.hours)) return false;
    if (amen.length && !amen.every(a => (s.amenities ?? []).includes(a))) return false;
    if (onlyPromo && !promoNow({ id: s.id, operatorId: opId(s) }, promos)) return false;
    return true;
  });
  const q = search.trim().toLowerCase();
  const matches = q
    ? filtered.filter(s => [s.name, s.city, s.address, s.operator].some(v => v.toLowerCase().includes(q))).slice(0, 6)
    : [];
  const activeFilters = [status, connector, power].filter(v => v !== 'all').length;
  const quick = onlyFree || onlyMine || openOnly || onlyPromo || amen.length > 0 || network !== 'all';

  const pick = (s: Station) => {
    setSearch('');
    // The map moves to it once its card is open (FocusStation), so the pin stays above the card.
    onSelectStation(s);
  };

  /** Me and the two or three closest stations within 25 km, or just me. */
  const frame = (p: Fix) => {
    const near = stations
      .map(s => ({ s, d: km(p, { lat: s.geoLat, lng: s.geoLng }) }))
      .filter(x => x.d < 25)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(x => [x.s.geoLat, x.s.geoLng] as [number, number]);
    setTarget({ lat: p.lat, lng: p.lng, zoom: 14, n: Date.now(), around: near });
  };
  const follow = () => {
    if (!stopWatch.current) stopWatch.current = watchLocation();
  };

  // Opening the map finds the driver: silently when the browser allows it, with one question when it asks.
  useEffect(() => {
    if (!autoLocate) return;
    let cancelled = false;
    void (async () => {
      const perm = await geoPermission();
      if (cancelled || perm === 'denied' || (perm !== 'granted' && askedOnce)) return;
      askedOnce = true;
      const pos = here ?? (await askLocation());
      if (cancelled || !pos) return;
      follow();
      if (!framedOnce && !touched.current && !selected) {
        framedOnce = true;
        frame(pos);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Once per opening of the map, after the welcome screens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLocate]);
  useEffect(() => () => stopWatch.current?.(), []);

  const locate = () => {
    setLocateNote('');
    if (here) {
      frame(here);
      follow();
      return;
    }
    setLocating(true);
    // Shared with the station card, which then shows distance and drive time.
    void askLocation().then(pos => {
      setLocating(false);
      if (pos) {
        frame(pos);
        follow();
      } else {
        setLocateNote('Нет доступа к геопозиции — разрешите его в настройках телефона или браузера');
        setTimeout(() => setLocateNote(''), 4000);
      }
    });
  };

  const panel = q || listOpen || showFilters;

  return (
    <div className={`relative isolate w-full h-full ${selected ? 'pg-focus' : ''}`} style={{ fontFamily: 'Inter, sans-serif' }}>
      <MapContainer center={[start.lat, start.lng]} zoom={start.zoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <BaseMap />
        <MeMarker fix={here} />
        <ClusteredMarkers stations={filtered} promos={promos} onSelect={pick} selectedId={selected?.id ?? null} />
        <MapBridge target={target} />
        <FocusStation station={selected} />
        <ViewKeeper onTouch={() => { touched.current = true; }} />
      </MapContainer>

      {!hideChrome && (
        <>
          {/* Top: the balance one glance away, and the map tools */}
          <div className="absolute top-3 left-3 right-3 z-[1000] flex items-start justify-between gap-2 pointer-events-none">
            {onOpenWallet && sessions.driver ? (
              <button onClick={onOpenWallet} aria-label="Кошелёк" data-tour="wallet" className="pointer-events-auto flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-2xl bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(15,23,42,0.12)]">
                <span className="w-9 h-9 rounded-xl bg-[#FFC83D] text-[#111] grid place-items-center"><Wallet size={18} /></span>
                <span className="text-left leading-tight">
                  <span className="block text-[11px] text-slate-500">Баланс</span>
                  <span className="block text-[15px] font-bold text-slate-900 tabular-nums">{`${balance.toLocaleString('ru-RU')} сум`}</span>
                  {bonus > 0 && <span className="block text-[11px] font-bold text-[#A87100] tabular-nums">{`+${bonus.toLocaleString('ru-RU')} бонус`}</span>}
                </span>
              </button>
            ) : <span />}
            <div className="pointer-events-auto flex flex-col gap-2 items-end">
              <button onClick={() => { setListOpen(v => !v); setShowFilters(false); }} aria-pressed={listOpen} aria-label={listOpen ? 'Показать карту' : 'Станции списком'} className="w-12 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(15,23,42,0.12)] grid place-items-center text-slate-800">
                {listOpen ? <MapIcon size={20} /> : <List size={20} />}
              </button>
              <button onClick={() => setLegend(v => !v)} aria-expanded={legend} aria-label="Что значат значки" data-tour="legend" className="w-12 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(15,23,42,0.12)] grid place-items-center text-slate-800">
                <Info size={20} />
              </button>
              {legend && (
                <div className="w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2 text-xs text-slate-700" style={{ animation: 'enter-up 0.2s ease both' }}>
                  <p className="flex items-center gap-2"><span className="pg-legend" style={{ background: '#16A34A' }} />Есть свободные</p>
                  <p className="flex items-center gap-2"><span className="pg-legend" style={{ background: '#EF4444' }} />Все заняты</p>
                  <p className="flex items-center gap-2"><span className="pg-legend" style={{ background: '#94A3B8' }} />Не работает</p>
                  <p className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded-md bg-[#FFC83D] text-[#111] font-black text-[10px]">−20%</span>Скидка от сети</p>
                  <p className="flex items-center gap-2 pt-2 border-t border-slate-100"><b className="text-slate-900">2/4</b>свободно / всего</p>
                  <p className="flex items-center gap-2"><span className="text-[#8a5b00]" dangerouslySetInnerHTML={{ __html: MOON }} />ночная скидка</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom sheet: search, networks, quick filters. The map stays tappable above it. */}
          <div className="absolute inset-x-0 bottom-0 z-[1000]">
            <div className="relative">
              <div className="absolute -top-[60px] left-3 right-3 flex items-end justify-between pointer-events-none">
                {onSos && sosOn ? (
                  <button onClick={onSos} aria-label="SOS — нужна помощь" className="pointer-events-auto w-12 h-12 rounded-2xl bg-red-600 text-white font-extrabold text-xs shadow-lg active:scale-95">SOS</button>
                ) : <span />}
                <button onClick={locate} aria-label="Моё местоположение" data-tour="locate" className="pointer-events-auto w-12 h-12 rounded-2xl bg-white shadow-[0_4px_20px_rgba(15,23,42,0.15)] grid place-items-center">
                  <Navigation size={20} className={`text-[#2563EB] ${here ? 'fill-[#2563EB]' : ''} ${locating ? 'animate-pulse' : ''}`} />
                </button>
              </div>
              {locateNote && (
                <p role="status" className="absolute -top-[110px] left-3 right-3 text-xs text-center bg-slate-900/85 text-white rounded-xl px-3 py-2 pg-reveal">{locateNote}</p>
              )}

              <div className="bg-white rounded-t-[28px] shadow-[0_-8px_30px_rgba(15,23,42,0.12)] pt-2 pb-3">
                <div className="mx-auto w-10 h-1 rounded-full bg-slate-200 mb-2" aria-hidden="true" />

                {panel && (
                  <div className="px-3 mb-2 max-h-[min(52vh,420px)] overflow-y-auto">
                    {q && (
                      <div role="listbox" aria-label="Найденные станции" className="rounded-2xl border border-slate-100 overflow-hidden">
                        {matches.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-slate-500">Ничего не нашлось{activeFilters || quick ? ' с текущими фильтрами' : ''}</p>
                        ) : (
                          matches.map(s => (
                            <button key={s.id} role="option" aria-selected={false} onClick={() => pick(s)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0">
                              <NetworkBadge name={s.operator} size={32} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">{s.name}</span>
                                <span className="block text-xs text-slate-500 truncate">{s.city} · {s.operator}</span>
                              </span>
                              <span className="text-xs font-semibold shrink-0" style={{ color: statusColor[s.status] }}>{freeOf(s)}/{s.connectors.length}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {/* The same stations as a list, nearest first — easier with one hand in the car. */}
                    {listOpen && !q && (
                      <div role="list" aria-label="Станции списком" className="pg-stagger space-y-2">
                        {filtered.length === 0 && (
                          <div className="py-3 text-center">
                            <span className="flex justify-center"><ChargerFriend size={140} mood="wait" /></span>
                            <p className="text-sm text-slate-500 mt-1">Нет станций под эти фильтры</p>
                          </div>
                        )}
                        {[...filtered]
                          .map(s => ({ s, d: here ? km(here, { lat: s.geoLat, lng: s.geoLng }) : null }))
                          .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : freeOf(b.s) - freeOf(a.s)))
                          .slice(0, 40)
                          .map(({ s, d }) => {
                            const cheapest = Math.min(...s.connectors.map(c => c.price));
                            const promo = promoNow({ id: s.id, operatorId: opId(s) }, promos);
                            return (
                              <button key={s.id} role="listitem" onClick={() => { setListOpen(false); pick(s); }} className="w-full flex items-center gap-3 p-3 text-left rounded-2xl bg-slate-50 hover:bg-slate-100">
                                <NetworkBadge name={s.operator} size={38} promo={!!promo} />
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm font-semibold text-slate-900 truncate">{s.name}</span>
                                  <span className="block text-xs text-slate-500 truncate">
                                    {`${s.operator} · `}<b style={{ color: statusColor[s.status] }}>{`${freeOf(s)}/${s.connectors.length}`}</b>{' свободно · от '}
                                    {promo && <s className="text-slate-400 mr-1">{cheapest.toLocaleString('ru-RU')}</s>}
                                    {`${discounted(cheapest, promo).toLocaleString('ru-RU')} сум`}
                                  </span>
                                  {!openNow(s.hours) && <span className="text-[11px] text-red-600 inline-flex items-center gap-1"><Clock size={10} />{`Закрыто · ${s.hours}`}</span>}
                                </span>
                                {d !== null && <span className="text-xs font-semibold text-slate-700 shrink-0">{fmtKm(d)}</span>}
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {showFilters && !q && !listOpen && (
                      <div className="space-y-3" style={{ animation: 'enter-up 0.2s ease both' }}>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">СТАТУС</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {['all', 'available', 'occupied', 'reserved'].map(f => (
                              <button key={f} onClick={() => setStatus(f)} aria-pressed={status === f} className={chip(status === f)}>
                                {f === 'all' ? 'Все' : statusLabel[f]}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">ТИП РАЗЪЁМА</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {CONNECTORS.map(c => (
                              <button key={c.id} onClick={() => setConnector(c.id)} aria-pressed={connector === c.id} className={chip(connector === c.id)}>
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">МОЩНОСТЬ</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {POWER.map(p => (
                              <button key={p.id} onClick={() => setPower(p.id)} aria-pressed={power === p.id}
                                className={`py-2 rounded-2xl text-center transition-colors ${power === p.id ? 'bg-[#111] text-white' : 'bg-slate-50 hover:bg-slate-100'}`}>
                                <p className={`text-xs font-semibold ${power === p.id ? 'text-white' : 'text-slate-700'}`}>{p.label}</p>
                                {p.sub && <p className={`text-[10px] ${power === p.id ? 'text-white/70' : 'text-slate-400'}`}>{p.sub}</p>}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">УДОБСТВА</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {['Кафе', 'Туалет', 'Wi-Fi', 'Крытая парковка', 'ТЦ'].map(a => (
                              <button key={a} onClick={() => toggleAmen(a)} aria-pressed={amen.includes(a)} className={chip(amen.includes(a), 'yellow')}>{a}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <p className="flex-1 text-xs text-slate-500">Найдено станций: <b className="text-slate-800">{filtered.length}</b></p>
                          <button onClick={() => { setStatus('all'); setConnector('all'); setPower('all'); setOnlyFree(false); setOnlyMine(false); setOnlyPromo(false); setOpenOnly(false); setAmen([]); setNetwork('all'); }} className="px-3 h-10 bg-slate-100 text-slate-600 text-xs font-semibold rounded-2xl hover:bg-slate-200">
                            Сбросить
                          </button>
                          <button onClick={() => setShowFilters(false)} className="px-5 h-10 bg-[#111] text-white text-xs font-semibold rounded-2xl">
                            Готово
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="px-3 flex items-center gap-2">
                  <div data-tour="search" className="flex-1 h-12 bg-slate-50 rounded-2xl flex items-center gap-2 px-3.5 border border-slate-100 focus-within:border-slate-300">
                    <Search size={18} className="text-slate-400 shrink-0" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Найти зарядную станцию"
                      aria-label="Поиск станции"
                      className="flex-1 min-w-0 text-[15px] outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} aria-label="Очистить поиск" className="p-1 text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowFilters(!showFilters); setListOpen(false); }}
                    aria-label="Фильтры"
                    data-tour="filters"
                    aria-expanded={showFilters}
                    className={`relative w-12 h-12 rounded-2xl grid place-items-center border transition-colors ${showFilters ? 'bg-[#111] text-white border-[#111]' : 'bg-slate-50 text-slate-700 border-slate-100'}`}
                  >
                    <SlidersHorizontal size={18} />
                    {activeFilters + amen.length > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#FFC83D] text-[#111] text-[10px] font-bold grid place-items-center border-2 border-white">{activeFilters + amen.length}</span>
                    )}
                  </button>
                </div>

                {/* Networks: every partner on the map, one tap to see only theirs */}
                <div data-tour="networks" className="mt-2.5 px-3 flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Сети">
                  <button onClick={() => setNetwork('all')} aria-pressed={network === 'all'} className={`shrink-0 h-10 px-4 rounded-2xl text-sm font-semibold border-2 ${network === 'all' ? 'border-[#111] bg-white text-[#111]' : 'border-transparent bg-slate-50 text-slate-700'}`}>Все</button>
                  {networks.map(n => (
                    <button key={n.id} onClick={() => setNetwork(v => (v === n.id ? 'all' : n.id))} aria-pressed={network === n.id} className={`shrink-0 h-10 pl-1.5 pr-3.5 rounded-2xl text-sm font-semibold border-2 inline-flex items-center gap-2 ${network === n.id ? 'border-[#111] bg-white text-[#111]' : 'border-transparent bg-slate-50 text-slate-700'}`}>
                      <NetworkBadge name={n.name} size={28} />
                      <span className="whitespace-nowrap">{n.name}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-2 px-3 flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Быстрые фильтры">
                  <button onClick={() => setOnlyPromo(v => !v)} aria-pressed={onlyPromo} className={chip(onlyPromo, 'yellow')}><Percent size={13} />Скидки</button>
                  <button onClick={() => setOnlyFree(v => !v)} aria-pressed={onlyFree} className={chip(onlyFree, 'green')}>Свободные</button>
                  {car && (
                    <button onClick={() => setOnlyMine(v => !v)} aria-pressed={onlyMine} className={chip(onlyMine)}>{`Для ${car.brand} ${car.model}`}</button>
                  )}
                  <button onClick={() => setOpenOnly(v => !v)} aria-pressed={openOnly} className={chip(openOnly, 'green')}>Открыто сейчас</button>
                  {quick && <span className="shrink-0 self-center text-xs font-semibold text-slate-500 px-1">{`${filtered.length} ${plural(filtered.length, ['станция', 'станции', 'станций'])}`}</span>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
