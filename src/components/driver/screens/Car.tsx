// Moved out of DriverApp.tsx: carBrands, portTypes, CarBonusBanner, AddCarScreen.
import { useState } from 'react';
import { Zap, X, Battery, ArrowLeft, CheckCircle } from 'lucide-react';
import { useLiveStations } from '../../../lib/live';
import { plural } from '../../../lib/analytics';
import { useSync } from '../../../lib/sync';
import { samePort } from '../../../lib/geo';

export const carBrands: Record<string, string[]> = {
  'BYD': ['Han EV', 'Atto 3', 'Tang EV', 'Seal', 'Dolphin'],
  'Hyundai': ['Ioniq 5', 'Ioniq 6', 'Kona Electric'],
  'Kia': ['EV6', 'EV9', 'Niro EV'],
  'Tesla': ['Model 3', 'Model Y', 'Model S', 'Model X'],
  'BMW': ['i3', 'i4', 'iX', 'iX3'],
  'Mercedes': ['EQA', 'EQB', 'EQC', 'EQS'],
  'Volkswagen': ['ID.3', 'ID.4', 'ID.6'],
  'Chevrolet': ['Bolt EV', 'Bolt EUV'],
  'Audi': ['e-tron', 'Q4 e-tron', 'A6 e-tron'],
  'Nio': ['ET5', 'ET7', 'ES8'],
};

export const portTypes: { type: string; label: string; maxKw: number }[] = [
  { type: 'CCS2', label: 'CCS2 (DC)', maxKw: 150 },
  { type: 'CCS1', label: 'CCS1 (DC)', maxKw: 150 },
  { type: 'CHAdeMO', label: 'CHAdeMO (DC)', maxKw: 100 },
  { type: 'Type2', label: 'Type 2 (AC)', maxKw: 22 },
  { type: 'Type1', label: 'Type 1 (AC)', maxKw: 7 },
  { type: 'GB/T DC', label: 'GB/T DC', maxKw: 120 },
  { type: 'NACS', label: 'NACS (Tesla)', maxKw: 250 },
];

/** "+100 000 sum for your car's details", while that reward is still to get. */
export function CarBonusBanner() {
  const reward = useSync().state?.rewards?.achievements.find(a => a.id === 'car');
  if (!reward || reward.grantedAt) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl px-4 py-3 flex items-center gap-3 text-[#111] pg-reveal" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFC83D)' }}>
      <span className="text-2xl pg-float" aria-hidden="true">🎁</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-extrabold">{`+${reward.amount.toLocaleString('ru-RU')} сум на зарядку`}</span>
        <span className="block text-xs opacity-75">Voli дарит бонус за данные вашего автомобиля</span>
      </span>
    </div>
  );
}

export function AddCarScreen({ onBack, onSave }: { onBack: () => void; onSave: (car: { brand: string; model: string; year: number; battery: number; port: string; maxKw: number; chargeLimit: number }) => void }) {
  // Editing starts from the car already saved, if there is one.
  const saved = useSync().sessions.driver?.car;
  const [brand, setBrand] = useState(saved?.brand ?? 'BYD');
  const [model, setModel] = useState(saved?.model ?? 'Han EV');
  const [year, setYear] = useState(saved?.year ?? 2024);
  const [battery, setBattery] = useState(saved?.battery ?? 85);
  const [port, setPort] = useState(saved?.port.replace(/^Type (\d)$/, 'Type$1') ?? 'CCS2');
  const [maxKw, setMaxKw] = useState(saved?.maxKw ?? 150);
  const [chargeLimit, setChargeLimit] = useState(saved?.chargeLimit ?? 80);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [saving, setSaving] = useState(false);
  const stations = useLiveStations();
  // New model years go on sale before the calendar year turns.
  const maxYear = new Date().getFullYear() + 1;

  const selectedPort = portTypes.find(p => p.type === port);
  // Where this car can actually charge, counted from the live map, not a slogan.
  const fitting = stations.filter(st => st.connectors.some(c => samePort(c.type, port) || samePort(c.type, 'Type 2'))).length;
  const fittingFast = stations.filter(st => st.connectors.some(c => samePort(c.type, port) && c.power >= 50)).length;
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ brand, model, year, battery, port, maxKw, chargeLimit });
    } finally {
      setSaving(false);
    }
  };

  if (step === 'confirm') {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
          <button onClick={() => setStep('form')} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
          <h1 className="text-base font-bold text-slate-900">Подтверждение</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="flex flex-col items-center py-6">
            <div className="w-20 h-20 bg-sky-100 rounded-3xl flex items-center justify-center mb-4 text-4xl pg-pop">🚗</div>
            <h2 className="text-xl font-bold text-slate-900">{brand} {model}</h2>
            <p className="text-slate-400 text-sm">{year}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {[
              { label: 'Марка', value: brand },
              { label: 'Модель', value: model },
              { label: 'Год', value: String(year) },
              { label: 'Ёмкость батареи', value: `${battery} кВт·ч` },
              { label: 'Тип разъёма', value: selectedPort?.label || port },
              { label: 'Макс. мощность зарядки', value: `${maxKw} кВт` },
            ].map(row => (
              <div key={row.label} className="px-4 py-3 flex justify-between border-b border-slate-50 last:border-none">
                <span className="text-sm text-slate-500">{row.label}</span>
                <span className="text-sm font-semibold text-slate-800">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4">
            <p className="text-xs font-semibold text-sky-700 mb-2 flex items-center gap-1.5">
              <Zap size={12} />Совместимость с сетью Voli
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={12} className="text-green-500" />
                <span className="text-sky-700">{`${fitting} ${plural(fitting, ['станция подходит', 'станции подходят', 'станций подходят'])} на карте`}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={12} className={fittingFast ? 'text-green-500' : 'text-slate-300'} />
                <span className="text-sky-700">{fittingFast ? `${fittingFast} — с быстрой зарядкой ${selectedPort?.label ?? port}` : `Быстрых станций с ${selectedPort?.label ?? port} пока нет`}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-8 pt-2">
          <button onClick={() => void save()} disabled={saving}
            className="w-full bg-sky-500 text-white rounded-2xl py-4 font-bold text-base disabled:opacity-60">
            {saving ? 'Сохраняем…' : saved ? 'Сохранить изменения' : 'Добавить автомобиль'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">{saved ? 'Мой автомобиль' : 'Добавить автомобиль'}</h1>
          <p className="text-xs text-slate-400">Данные для автоматической совместимости</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <CarBonusBanner />
        {/* Brand */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">МАРКА</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(carBrands).map(b => (
              <button key={b} onClick={() => { setBrand(b); setModel(carBrands[b][0]); }}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${brand === b ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">МОДЕЛЬ</p>
          <div className="flex flex-wrap gap-2">
            {(carBrands[brand] || []).map(m => (
              <button key={m} onClick={() => setModel(m)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${model === m ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Year */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">ГОД ВЫПУСКА</p>
            <span className="text-sm font-bold text-slate-900 mono">{year}</span>
          </div>
          <input type="range" min="2015" max={maxYear} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Год выпуска"
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>2015</span><span>{maxYear}</span></div>
        </div>

        {/* Battery */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">ЁМКОСТЬ БАТАРЕИ</p>
            <span className="text-sm font-bold text-slate-900 mono">{battery} кВт·ч</span>
          </div>
          <input type="range" min="20" max="120" step="5" value={battery} onChange={e => setBattery(Number(e.target.value))} aria-label="Ёмкость батареи, кВт·ч"
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>20 кВт·ч</span><span>120 кВт·ч</span></div>
        </div>

        {/* Port type */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">ТИП ЗАРЯДНОГО РАЗЪЁМА</p>
          <div className="space-y-2">
            {portTypes.map(pt => (
              <button key={pt.type} onClick={() => { setPort(pt.type); setMaxKw(pt.maxKw); }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-colors ${port === pt.type ? 'border-sky-500 bg-sky-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${port === pt.type ? 'bg-sky-500' : 'bg-slate-200'}`}>
                    <Zap size={12} className={port === pt.type ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <span className="text-sm font-medium text-slate-800">{pt.label}</span>
                </div>
                <span className="text-xs text-slate-400">макс. {pt.maxKw} кВт</span>
              </button>
            ))}
          </div>
        </div>

        {/* Max charge power */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">МАКС. МОЩНОСТЬ ЗАРЯДКИ</p>
            <span className="text-sm font-bold text-slate-900 mono">{maxKw} кВт</span>
          </div>
          <input type="range" min="3" max={selectedPort?.maxKw || 150} step="1" value={maxKw} onChange={e => setMaxKw(Number(e.target.value))} aria-label="Макс. мощность зарядки, кВт"
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>3 кВт</span><span>{selectedPort?.maxKw} кВт</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">ЛИМИТ ЗАРЯДА</p>
            <span className="text-sm font-bold text-slate-900 mono">{chargeLimit}%</span>
          </div>
          <input type="range" min="50" max="100" step="5" value={chargeLimit} onChange={e => setChargeLimit(Number(e.target.value))} aria-label="Лимит заряда, %" className="w-full accent-sky-500" />
          <p className="text-xs text-slate-400 mt-1">{`Запас хода при ${chargeLimit}% ≈ ${Math.round((battery * chargeLimit) / 100 / 0.18)} км. До 80% быстрее и бережнее для батареи.`}</p>
        </div>
      </div>
      <div className="px-4 pb-6 pt-2">
        <button onClick={() => setStep('confirm')}
          className="w-full bg-sky-500 text-white rounded-2xl py-4 font-bold text-base">
          Далее →
        </button>
      </div>
    </div>
  );
}
