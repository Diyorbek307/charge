import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, AlertTriangle, CalendarCheck, CheckCircle, ChevronRight, Flashlight, ImageIcon, Keyboard, MapPin, Navigation, Scan, Star, X, Zap } from 'lucide-react';
import type { Station } from '../../data/mockData';
import { useLiveStations } from '../../lib/live';
import { useSync } from '../../lib/sync';
import { useMyLocation, km, fmtKm } from '../../lib/geo';
import { readStickerLink } from '../../lib/stickers';

type Phase = 'idle' | 'camera' | 'success' | 'error' | 'manual';

const STATUS: Record<string, { text: string; color: string }> = {
  available: { text: 'Свободно', color: '#22C55E' },
  occupied: { text: 'Занято', color: '#EF4444' },
  unavailable: { text: 'Недоступно', color: '#94A3B8' },
  reserved: { text: 'Забронировано', color: '#F59E0B' },
};

/**
 * The station a code points at. A sticker carries the station ID ("ST-001"),
 * a link with it, or the bare number; spacing and case vary between printers.
 */
export function stationFromCode(raw: string, stations: Station[]): Station | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  const exact = [...stations].sort((a, b) => b.id.length - a.id.length).find(s => text.includes(s.id.toLowerCase()));
  if (exact) return exact;
  const m = text.match(/st[\s_-]?(\d{1,4})\b/) ?? text.match(/^(\d{1,4})$/);
  if (!m) return null;
  const id = `st-${m[1].padStart(3, '0')}`;
  return stations.find(s => s.id.toLowerCase() === id) ?? null;
}

interface Detector { detect: (src: CanvasImageSource | ImageBitmap) => Promise<{ rawValue: string }[]> }
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

/**
 * Reads a QR code from a frame. The browser's own detector where it has one
 * (Android Chrome); a small decoder loaded on demand elsewhere (iPhone).
 */
async function makeReader(): Promise<(src: HTMLVideoElement | ImageBitmap) => Promise<string | null>> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? ['qr_code'];
      if (formats.includes('qr_code')) {
        const d = new Native({ formats: ['qr_code'] });
        return async src => (await d.detect(src))[0]?.rawValue ?? null;
      }
    } catch {
      /* fall through to the decoder */
    }
  }
  const jsQR = (await import('jsqr')).default;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async src => {
    const w0 = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
    const h0 = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    if (!ctx || !w0 || !h0) return null;
    // A smaller frame decodes faster and a sticker fills the middle anyway.
    const scale = Math.min(1, 720 / Math.max(w0, h0));
    canvas.width = Math.round(w0 * scale);
    canvas.height = Math.round(h0 * scale);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  };
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)} мин назад`;
  if (m < 24 * 60) return `${Math.round(m / 60)} ч назад`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'Вчера' : `${d} дн. назад`;
};

/**
 * Scanning the sticker on a charger: the real camera, a photo from the
 * gallery, or the code typed in. Whatever the code, it has to name a station
 * on the map before anything starts.
 */
export default function QRScanScreen({ onBack, onStartCharging, onBook, onRoute }: { onBack: () => void; onStartCharging: (s: Station, point?: string | null) => void; onBook: (s: Station) => void; onRoute: (s: Station) => void }) {
  const stations = useLiveStations();
  const { state, sessions } = useSync();
  const me = sessions.driver;
  const here = useMyLocation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [manualCode, setManualCode] = useState('');
  const [foundId, setFoundId] = useState<string | null>(null);
  // Picked from the recent list, nothing was scanned — the screen should not claim it was.
  const [fromRecent, setFromRecent] = useState(false);
  // A sticker names its charge point too (A, B…); that one is offered first.
  const [point, setPoint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorKind, setErrorKind] = useState<'code' | 'camera'>('code');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [zoom, setZoom] = useState<{ min: number; max: number; value: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The station live, so a point taken while the driver reads the card shows as taken.
  const found = foundId ? stations.find(s => s.id === foundId) ?? null : null;

  // Recent stations are the driver's own charges, not a made-up list; "Clear" hides them on this device.
  const clearedKey = `oc-qr-recent-cleared-${me?.id ?? 'guest'}`;
  const [clearedAt, setClearedAt] = useState(() => {
    try {
      return localStorage.getItem(clearedKey) ?? '';
    } catch {
      return '';
    }
  });
  const recent = (state?.sessions ?? [])
    .filter(x => x.userId === me?.id && x.start > clearedAt)
    .sort((a, b) => b.start.localeCompare(a.start))
    .filter((x, i, all) => all.findIndex(y => y.stationId === x.stationId) === i)
    .map(x => ({ at: x.start, station: stations.find(s => s.id === x.stationId) }))
    .filter((x): x is { at: string; station: Station } => !!x.station)
    .slice(0, 3);
  const clearRecent = () => {
    const now = new Date().toISOString();
    setClearedAt(now);
    try {
      localStorage.setItem(clearedKey, now);
    } catch {
      /* private mode: this visit only */
    }
  };
  const nearest = here ? [...stations].sort((a, b) => km(here, { lat: a.geoLat, lng: a.geoLng }) - km(here, { lat: b.geoLat, lng: b.geoLng })) : stations;

  const accept = (text: string) => {
    const s = stationFromCode(text, stations);
    if (s) {
      navigator.vibrate?.(35);
      setFromRecent(false);
      setPoint(readStickerLink(text)?.point ?? null);
      setFoundId(s.id);
      setPhase('success');
    } else {
      setErrorKind('code');
      setErrorMsg(`Код «${text.length > 40 ? `${text.slice(0, 40)}…` : text}» не относится ни к одной станции на карте.`);
      setPhase('error');
    }
  };
  const cameraFailed = (msg: string) => {
    setErrorKind('camera');
    setErrorMsg(msg);
    setPhase('error');
  };

  // The camera runs only while its screen is open, and always stops after.
  useEffect(() => {
    if (phase !== 'camera') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | null = null;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return cameraFailed('Этот браузер не даёт доступ к камере. Введите код со станции вручную.');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (e) {
        const name = (e as Error).name;
        if (!cancelled) cameraFailed(name === 'NotAllowedError' ? 'Нет доступа к камере. Разрешите его в настройках браузера — или введите код вручную.' : name === 'NotFoundError' ? 'На этом устройстве нет камеры. Введите код со станции вручную.' : 'Камера не включилась. Попробуйте ещё раз или введите код вручную.');
        return;
      }
      if (cancelled) return stream.getTracks().forEach(t => t.stop());
      const v = video.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      const t = stream.getVideoTracks()[0];
      track.current = t;
      const caps = (t.getCapabilities?.() ?? {}) as { torch?: boolean; zoom?: { min: number; max: number } };
      setTorch(caps.torch ? false : null);
      setZoom(caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: Math.min(caps.zoom.max, caps.zoom.min * 4), value: caps.zoom.min } : null);
      const read = await makeReader();
      const tick = async () => {
        if (cancelled) return;
        let text: string | null = null;
        try {
          if (v.readyState >= 2) text = await read(v);
        } catch {
          /* a frame the decoder could not take */
        }
        if (cancelled) return;
        if (text) accept(text);
        else timer = setTimeout(tick, 160);
      };
      void tick();
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
      track.current = null;
    };
    // accept and cameraFailed only read the latest stations through state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase === 'manual') setTimeout(() => inputRef.current?.focus(), 120);
  }, [phase]);

  const setTorchOn = (on: boolean) => {
    void track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).then(() => setTorch(on)).catch(() => setTorch(null));
  };
  const setZoomTo = (value: number) => {
    if (!zoom) return;
    setZoom({ ...zoom, value });
    void track.current?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const text = await (await makeReader())(bitmap);
      if (text) accept(text);
      else {
        setErrorKind('code');
        setErrorMsg('На фото не нашёлся QR-код. Снимите наклейку ближе и при хорошем свете.');
        setPhase('error');
      }
    } catch {
      setErrorKind('code');
      setErrorMsg('Не удалось открыть это фото.');
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setFoundId(null);
    setManualCode('');
    setErrorMsg('');
  };
  const galleryInput = <input ref={gallery} type="file" accept="image/*" className="hidden" aria-hidden="true" tabIndex={-1} onChange={e => { void fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />;

  const header = (title: string, sub: string | null, back: () => void, right?: ReactNode) => (
    <div className="bg-white/85 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
      <button aria-label="Назад" onClick={back} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-slate-900">{title}</h1>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );

  // ── START ──
  if (phase === 'idle') return (
    <div className="h-full flex flex-col bg-slate-50">
      {galleryInput}
      {header('Сканер QR-кода', 'Наклейка на зарядной станции', onBack)}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pg-stagger">
        <div className="rounded-3xl overflow-hidden relative" style={{ background: 'linear-gradient(145deg,#1F1F1F,#111111)', boxShadow: '0 12px 40px rgba(255,200,61,0.22)' }}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full opacity-25 pointer-events-none" style={{ background: '#FFC83D', filter: 'blur(48px)' }} />
          <div className="relative px-6 py-8 flex flex-col items-center">
            <div className="relative mb-5 pg-float">
              <div className="w-20 h-20 rounded-2xl grid place-items-center" style={{ background: 'rgba(255,200,61,0.14)', border: '1.5px solid rgba(255,200,61,0.35)' }}>
                <Scan size={34} className="text-[#FFC83D]" style={{ filter: 'drop-shadow(0 0 8px #FFC83D)' }} />
              </div>
              {[1, 2].map(i => (
                <div key={i} className="absolute inset-0 rounded-2xl border border-[#FFC83D]/30" style={{ animation: `pulse-halo ${1.5 + i * 0.5}s ease-out infinite`, animationDelay: `${i * 0.4}s` }} />
              ))}
            </div>
            <h2 className="text-white font-bold text-lg mb-1">Отсканируйте QR</h2>
            <p className="text-white/55 text-xs text-center mb-6">Он на корпусе станции, на кабеле или на табличке рядом</p>
            <button onClick={() => setPhase('camera')}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-[#111]"
              style={{ background: 'linear-gradient(135deg,#FFD66B,#FFB000)', boxShadow: '0 6px 24px rgba(255,200,61,0.35)' }}>
              <Scan size={18} />Открыть камеру
            </button>
            <button onClick={() => gallery.current?.click()} className="mt-3 text-white/70 text-xs font-semibold inline-flex items-center gap-1.5">
              <ImageIcon size={14} />Выбрать фото наклейки
            </button>
          </div>
        </div>

        <button onClick={() => setPhase('manual')}
          className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 hover:border-sky-200">
          <div className="w-10 h-10 rounded-xl bg-slate-100 grid place-items-center shrink-0"><Keyboard size={18} className="text-slate-600" /></div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-slate-800">Ввести код вручную</p>
            <p className="text-xs text-slate-400">Код под QR, например ST-001</p>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>

        {recent.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Вы заряжались здесь</p>
              <button onClick={clearRecent} className="text-[11px] text-sky-600 font-semibold">Очистить</button>
            </div>
            {recent.map(r => (
              <button key={r.station.id} onClick={() => { setFromRecent(true); setPoint(null); setFoundId(r.station.id); setPhase('success'); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-b-0">
                <div className="w-9 h-9 rounded-xl bg-sky-50 grid place-items-center shrink-0"><Zap size={15} className="text-sky-600" /></div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.station.name}</p>
                  <p className="text-xs text-slate-400">{`${r.station.id.toUpperCase()} · ${ago(r.at)}`}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS[r.station.status]?.color }} />
                  <span className="text-[10px] text-slate-400">{STATUS[r.station.status]?.text}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── CAMERA ──
  if (phase === 'camera') return (
    <div className="h-full flex flex-col relative overflow-hidden bg-black">
      {galleryInput}
      <video ref={video} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay aria-hidden="true" />
      <div className="relative z-20 flex items-center justify-between px-4 pt-5 pb-3">
        <button onClick={reset} aria-label="Остановить сканирование" className="w-10 h-10 rounded-full bg-black/40 backdrop-blur grid place-items-center">
          <X size={18} className="text-white" />
        </button>
        <p className="text-white font-semibold text-sm drop-shadow">Наведите на QR-код</p>
        {torch !== null ? (
          <button onClick={() => setTorchOn(!torch)} aria-pressed={torch} aria-label="Фонарик" className={`w-10 h-10 rounded-full backdrop-blur grid place-items-center ${torch ? 'bg-[#FFC83D] text-[#111]' : 'bg-black/40 text-white'}`}>
            <Flashlight size={18} />
          </button>
        ) : <span className="w-10" />}
      </div>

      <div className="flex-1 relative z-10 flex flex-col items-center justify-center">
        <div className="relative pg-frame" style={{ width: 230, height: 230 }}>
          {/* Everything but the window is dimmed */}
          <div className="absolute inset-0 rounded-3xl" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />
          <div className="absolute left-3 right-3 h-0.5 pg-laser" style={{ background: 'linear-gradient(90deg,transparent,#FFC83D,#FFE58A,#FFC83D,transparent)', boxShadow: '0 0 12px #FFC83D' }} />
          {(['tl', 'tr', 'bl', 'br'] as const).map(c => (
            <span key={c} className="absolute w-8 h-8" style={{
              [c[0] === 't' ? 'top' : 'bottom']: -2, [c[1] === 'l' ? 'left' : 'right']: -2,
              [`border${c[0] === 't' ? 'Top' : 'Bottom'}`]: '4px solid #FFC83D', [`border${c[1] === 'l' ? 'Left' : 'Right'}`]: '4px solid #FFC83D',
              [`border${c[0] === 't' ? 'Top' : 'Bottom'}${c[1] === 'l' ? 'Left' : 'Right'}Radius`]: 18,
            }} />
          ))}
        </div>
        <p className="mt-6 text-white/80 text-xs drop-shadow">Код считается сам — держите телефон ровно</p>
        {zoom && (
          <div className="mt-4 flex gap-1 bg-black/45 rounded-full p-1 backdrop-blur">
            {[zoom.min, (zoom.min + zoom.max) / 2, zoom.max].map(z => (
              <button key={z} onClick={() => setZoomTo(z)} aria-pressed={Math.abs(zoom.value - z) < 0.01}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${Math.abs(zoom.value - z) < 0.01 ? 'bg-white text-black' : 'text-white/70'}`}>
                {`${(z / zoom.min).toFixed(z / zoom.min % 1 ? 1 : 0)}×`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative z-20 px-10 pb-8 pt-4 flex items-center justify-between">
        <button onClick={() => setPhase('manual')} className="flex flex-col items-center gap-1.5">
          <span className="w-12 h-12 rounded-full bg-black/40 backdrop-blur grid place-items-center"><Keyboard size={19} className="text-white" /></span>
          <span className="text-white/80 text-[10px]">Ввести код</span>
        </button>
        <button onClick={() => gallery.current?.click()} className="flex flex-col items-center gap-1.5">
          <span className="w-12 h-12 rounded-full bg-black/40 backdrop-blur grid place-items-center"><ImageIcon size={19} className="text-white" /></span>
          <span className="text-white/80 text-[10px]">Из галереи</span>
        </button>
      </div>
    </div>
  );

  // ── FOUND ──
  if (phase === 'success' && found) {
    const avail = found.connectors.filter(c => c.status === 'available');
    const pointIndex = point ? found.connectors.findIndex(c => c.id === point) : -1;
    const pointLetter = pointIndex >= 0 ? String.fromCharCode(65 + pointIndex) : null;
    const dist = here ? km(here, { lat: found.geoLat, lng: found.geoLng }) : null;
    return (
      <div className="h-full flex flex-col bg-slate-50">
        {header(fromRecent ? 'Станция' : 'Станция найдена', null, reset)}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          <div className="flex flex-col items-center py-3">
            <div className="w-16 h-16 rounded-2xl grid place-items-center mb-3 pg-pop" style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)', boxShadow: '0 8px 24px rgba(34,197,94,0.4)' }}>
              <CheckCircle size={32} className="text-white" />
            </div>
            <p className="font-bold text-emerald-700 text-base">{fromRecent ? 'Вы заряжались здесь' : 'QR распознан'}</p>
            <p className="text-slate-400 text-xs mt-0.5">{`Код ${found.id.toUpperCase()}${pointLetter ? ` · точка ${pointLetter}` : ''}`}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden pg-reveal" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <div className="px-4 py-4">
              <p className="font-bold text-slate-900 text-base">{found.name}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={11} className="shrink-0" /><span className="truncate">{`${found.address}, ${found.city}`}</span></p>
              <div className="flex items-center gap-2 mt-2 text-[11px]">
                <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: avail.length ? '#DCFCE7' : '#FEF3C7', color: avail.length ? '#15803D' : '#B45309' }}>
                  {`${avail.length}/${found.connectors.length} свободно`}
                </span>
                <span className="inline-flex items-center gap-0.5 font-semibold text-slate-600"><Star size={11} className="text-amber-400 fill-amber-400" />{found.rating.toFixed(1)}</span>
                {dist !== null && <span className="text-slate-400">{`· ${fmtKm(dist)}`}</span>}
                <span className="text-slate-400 truncate">{`· ${found.operator}`}</span>
              </div>
            </div>
            <div className="border-t border-slate-50 px-4 py-3 grid grid-cols-2 gap-2">
              {found.connectors.map(c => (
                <div key={c.id} className={`flex items-center gap-2 p-2.5 rounded-xl border ${c.status === 'available' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50 opacity-60'} ${c.id === point ? 'ring-2 ring-[#FFB000]' : ''}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS[c.status]?.color }} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-800 truncate">{c.type}</p>
                    <p className="text-[10px] text-slate-400">{`${c.power} кВт · ${c.price.toLocaleString('ru-RU')} сум`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {avail.length === 0 && (
            <div className="flex items-start gap-3 p-4 rounded-2xl border bg-amber-50 border-amber-200 pg-reveal">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Свободных разъёмов нет</p>
                <p className="text-xs text-amber-700 mt-0.5">Встаньте в очередь на карточке станции — сообщим, когда освободится.</p>
              </div>
            </div>
          )}

          <div className="space-y-2.5 pb-2">
            <button onClick={() => onStartCharging(found, point)} disabled={avail.length === 0}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 text-[#111] shadow-[0_6px_20px_rgba(255,200,61,0.35)] disabled:shadow-none"
              style={avail.length ? { background: 'linear-gradient(135deg,#FFD66B,#FFB000)' } : undefined}>
              <Zap size={18} />Начать зарядку
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onBook(found)} className="py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                <CalendarCheck size={15} />Забронировать
              </button>
              <button onClick={() => onRoute(found)} className="py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                <Navigation size={15} />Маршрут
              </button>
            </div>
            <button onClick={() => { setFoundId(null); setPhase('camera'); }} className="w-full py-3 rounded-2xl font-medium text-sm text-slate-500 flex items-center justify-center gap-2">
              <Scan size={14} />Сканировать другой код
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── NOT FOUND / NO CAMERA ──
  if (phase === 'error' || phase === 'success') return (
    <div className="h-full flex flex-col bg-slate-50">
      {galleryInput}
      {header(errorKind === 'camera' ? 'Камера недоступна' : 'Станция не найдена', null, reset)}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-6 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 grid place-items-center pg-shake" style={{ border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <p className="text-slate-600 text-sm leading-relaxed text-center">{errorMsg || 'Станция больше не отображается на карте.'}</p>
        <div className="w-full space-y-2.5 pt-2">
          <button onClick={() => setPhase('camera')}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-[#111]"
            style={{ background: 'linear-gradient(135deg,#FFD66B,#FFB000)' }}>
            <Scan size={16} />{errorKind === 'camera' ? 'Попробовать ещё раз' : 'Сканировать ещё раз'}
          </button>
          <button onClick={() => { setManualCode(''); setPhase('manual'); }}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700">
            <Keyboard size={16} />Ввести код вручную
          </button>
        </div>
        {errorKind === 'code' && (
          <div className="w-full p-4 rounded-2xl bg-white border border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-2">Почему так бывает</p>
            {['QR-код от сети, которая ещё не подключена к PowerGo', 'Наклейка повреждена или плохо освещена', 'Это QR не станции, а, например, рекламы рядом'].map(r => (
              <p key={r} className="text-xs text-slate-500 flex gap-2 mt-1"><span className="w-1 h-1 rounded-full bg-slate-400 shrink-0 mt-1.5" />{r}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── TYPED CODE ──
  const typed = manualCode.trim();
  return (
    <div className="h-full flex flex-col bg-white">
      {header('Ввод кода станции', 'Код напечатан под QR', () => setPhase('idle'))}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 focus-within:border-[#FFB000] transition-colors">
          <label htmlFor="qr-code" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Код станции</label>
          <input id="qr-code" ref={inputRef}
            value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase().slice(0, 64))}
            onKeyDown={e => e.key === 'Enter' && typed && accept(typed)}
            placeholder="ST-001"
            autoCapitalize="characters"
            autoComplete="off"
            className="w-full bg-transparent text-2xl font-bold mono text-slate-900 tracking-widest outline-none placeholder:text-slate-300"
          />
          {manualCode && (
            <button onClick={() => setManualCode('')} className="mt-2 text-xs text-slate-400 flex items-center gap-1">
              <X size={11} />Очистить
            </button>
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 px-1">{here ? 'Коды станций рядом' : 'Коды станций'}</p>
          <div className="flex flex-wrap gap-2">
            {nearest.slice(0, 6).map(st => (
              <button key={st.id} onClick={() => setManualCode(st.id.toUpperCase())} title={st.name}
                className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold mono text-slate-700 hover:border-[#FFB000]">
                {st.id.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 pb-6 pt-2 space-y-2">
        <button onClick={() => accept(typed)} disabled={!typed}
          className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 text-[#111]"
          style={typed ? { background: 'linear-gradient(135deg,#FFD66B,#FFB000)', boxShadow: '0 6px 20px rgba(255,200,61,0.35)' } : undefined}>
          <CheckCircle size={18} />Найти станцию
        </button>
        <button onClick={() => setPhase('camera')} className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-slate-100 text-slate-600">
          <Scan size={15} />Открыть камеру
        </button>
      </div>
    </div>
  );
}
