// Moved out of DriverApp.tsx: OnboardingScreen.
import { useState } from 'react';
import { Zap, CheckCircle, Plus, Wallet, Moon } from 'lucide-react';
import { useSync } from '../../../lib/sync';
import { BRAND } from '../../../brand';
import { CarBonusBanner } from './Car';

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { actions, updateAccount } = useSync();
  const [step, setStep] = useState(0);
  const [carBrand, setCarBrand] = useState('BYD');
  const [carModel, setCarModel] = useState('');
  const [battery, setBattery] = useState(60);
  const [connector, setConnector] = useState('CCS2');
  const [saving, setSaving] = useState(false);
  const [carError, setCarError] = useState('');

  const onboardBrands = ['BYD', 'Hyundai', 'Kia', 'Tesla', 'Chevrolet', 'Geely', 'Zeekr', 'Другая'];
  const batteryOptions = [40, 60, 77, 82, 100];
  const connectorOptions = ['CCS2', 'GB/T DC', 'Type 2', 'CHAdeMO'];

  const saveCar = async () => {
    if (!carModel.trim()) return setStep(1);
    setSaving(true);
    setCarError('');
    try {
      const maxKw = connector === 'Type 2' ? 11 : connector === 'CHAdeMO' ? 50 : 150;
      const { user } = await actions.saveCar('driver', { brand: carBrand === 'Другая' ? 'Другая марка' : carBrand, model: carModel.trim(), year: new Date().getFullYear(), battery, port: connector, maxKw });
      updateAccount('driver', user);
      setStep(1);
    } catch (e) {
      setCarError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    <div key="car" className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ animation: 'enter-up 0.35s ease both' }}>
      <div className="text-center pb-2">
        <h2 className="text-lg font-bold text-slate-900">Ваш автомобиль</h2>
        <p className="text-sm text-slate-400">Чтобы показывать подходящие разъёмы, время и стоимость зарядки</p>
      </div>
      <CarBonusBanner />
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">МАРКА</p>
        <div className="grid grid-cols-4 gap-2">
          {onboardBrands.map(b => (
            <button key={b} onClick={() => setCarBrand(b)} aria-pressed={carBrand === b} className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${carBrand === b ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{b}</button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">МОДЕЛЬ</p>
        <input value={carModel} onChange={e => setCarModel(e.target.value)} aria-label="Модель" placeholder={carBrand === 'BYD' ? 'Например: Song Plus' : carBrand === 'Hyundai' ? 'Например: Ioniq 5' : 'Модель'} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 text-slate-800 placeholder:text-slate-300" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">ЁМКОСТЬ БАТАРЕИ</p>
        <div className="flex gap-2">
          {batteryOptions.map(b => (
            <button key={b} onClick={() => setBattery(b)} aria-pressed={battery === b} className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${battery === b ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-600'}`}>
              {b}<span className="block text-[10px] font-normal opacity-70">кВт·ч</span>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">БЫСТРАЯ ЗАРЯДКА</p>
        <div className="grid grid-cols-2 gap-2">
          {connectorOptions.map(c => (
            <button key={c} onClick={() => setConnector(c)} aria-pressed={connector === c} className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${connector === c ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-600'}`}>{c}</button>
          ))}
        </div>
      </div>
      {carError && <p className="text-xs text-red-500 px-1">{carError}</p>}
    </div>,

    <div key="pay" className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ animation: 'enter-up 0.35s ease both' }}>
      <div className="text-center pb-2">
        <h2 className="text-lg font-bold text-slate-900">Как платить</h2>
        <p className="text-sm text-slate-400">Без привязки карты в приложении</p>
      </div>
      {[
        { icon: <Wallet size={18} className="text-emerald-500" />, title: 'Кошелёк', text: 'Пополняете через Payme, Click, Uzum или Humo — данные карты остаются у платёжной системы.' },
        { icon: <Zap size={18} className="text-sky-500" />, title: 'Оплата по факту', text: 'За зарядку списывается только полученная энергия по цене станции.' },
        { icon: <Moon size={18} className="text-violet-500" />, title: 'Ночью дешевле', text: 'С 23:00 до 07:00 цена ×0,7 на всех станциях сети.' },
      ].map(x => (
        <div key={x.title} className="flex items-start gap-3 bg-slate-50 rounded-2xl px-4 py-3">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">{x.icon}</div>
          <div><p className="text-sm font-semibold text-slate-800">{x.title}</p><p className="text-xs text-slate-500 mt-0.5">{x.text}</p></div>
        </div>
      ))}
    </div>,
  ];

  return (
    <div className="absolute inset-0 bg-white flex flex-col" style={{ zIndex: 9999, fontFamily: 'Inter, sans-serif' }}>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
        <span className="text-sm font-bold text-sky-500">{BRAND.name}</span>
        <button onClick={() => onComplete()} className="text-xs text-slate-400 font-medium px-3 py-1.5 rounded-xl hover:bg-slate-100">Пропустить</button>
      </div>
      <div className="flex items-center justify-center gap-2 py-3 shrink-0">
        {[0, 1].map(i => (
          <div key={i} className={`rounded-full transition-all ${i === step ? 'w-5 h-2.5 bg-sky-500' : i < step ? 'w-2.5 h-2.5 bg-sky-300' : 'w-2.5 h-2.5 bg-slate-200'}`} />
        ))}
      </div>
      {steps[step]}
      <div className="px-4 pb-8 pt-3 shrink-0 space-y-2">
        <button
          onClick={() => (step === 0 ? void saveCar() : onComplete())}
          disabled={saving}
          className="w-full bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl py-4 font-bold text-base shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {step === 1 ? <><CheckCircle size={18} />Готово — к карте</> : carModel.trim() ? 'Сохранить и далее →' : 'Далее →'}
        </button>
        {step === 0 && <button onClick={() => setStep(1)} className="w-full text-slate-400 text-sm font-medium py-2">Добавить позже</button>}
      </div>
    </div>
  );
}
