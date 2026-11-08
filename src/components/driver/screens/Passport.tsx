import { useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { apiClient, type Account, type BonusGrant } from '../../../lib/api';
import { useSync } from '../../../lib/sync';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;

/**
 * The driver's passport: a one-time bonus, and one person cannot collect welcome
 * bonuses on many accounts. The server keeps only the series, the last three digits
 * and the birth date; the number and the ПИНФЛ only check the passport is not used yet.
 */
export default function PassportScreen({ onBack, onSaved }: { onBack: () => void; onSaved: (user: Account, granted?: BonusGrant[]) => void }) {
  const { state, sessions } = useSync();
  const me = sessions.driver;
  const reward = state?.rewards?.achievements.find(a => a.id === 'passport');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [pinfl, setPinfl] = useState('');
  const [birth, setBirth] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = me?.passport;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { user, granted } = await apiClient.savePassport({ series, number, pinfl, birth });
      onSaved(user, granted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full h-12 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-[#FFC83D] focus:ring-2 focus:ring-[#FFC83D]/40';

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Паспорт</h1>
          <p className="text-xs text-slate-500">Один раз — и бонус на зарядку</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {saved ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#FFF3C4] grid place-items-center shrink-0"><ShieldCheck size={20} className="text-[#8A5B00]" /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Паспорт указан</p>
              <p className="text-sm text-slate-600 mt-0.5" data-no-translate>{`${saved.series} ••••${saved.last}`}</p>
              <p className="text-xs text-slate-500 mt-0.5">{`Дата рождения: ${new Date(`${saved.birth}T00:00:00Z`).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}`}</p>
              <p className="text-xs text-slate-400 mt-2">Чтобы изменить, напишите в поддержку</p>
            </div>
          </div>
        ) : (
          <>
            {reward && !reward.grantedAt && (
              <div className="relative overflow-hidden rounded-2xl px-4 py-3 flex items-center gap-3 text-[#111]" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFC83D)' }}>
                <span className="text-2xl" aria-hidden="true">🎁</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-extrabold">{`+${sum(reward.amount)} на зарядку`}</span>
                  <span className="block text-xs opacity-75">Voli дарит бонус за данные паспорта</span>
                </span>
              </div>
            )}
            <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Серия</span>
                  <input id="passport-series" className={`${field} mt-1 uppercase tracking-widest`} value={series} onChange={e => setSeries(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} placeholder="AA" autoComplete="off" required />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Номер</span>
                  <input id="passport-number" className={`${field} mt-1 tabular-nums tracking-wider`} inputMode="numeric" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="1234567" autoComplete="off" required />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">ПИНФЛ — 14 цифр</span>
                <input id="passport-pinfl" className={`${field} mt-1 tabular-nums tracking-wider`} inputMode="numeric" value={pinfl} onChange={e => setPinfl(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="30101900000000" autoComplete="off" required />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">Дата рождения</span>
                <input id="passport-birth" type="date" className={`${field} mt-1`} value={birth} onChange={e => setBirth(e.target.value)} required />
              </label>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={saving} className="w-full h-12 rounded-xl bg-[#111] text-[#FFC83D] font-bold text-sm disabled:opacity-60">
                {saving ? 'Сохраняем…' : reward && !reward.grantedAt ? 'Сохранить и получить бонус' : 'Сохранить'}
              </button>
            </form>
            <p className="text-xs text-slate-500 px-1 leading-relaxed">Мы храним только серию, последние три цифры номера и дату рождения. Полный номер и ПИНФЛ не сохраняются: по ним проверяем только, что паспорт не привязан к другому аккаунту. Один паспорт — один бонус.</p>
          </>
        )}
      </div>
    </div>
  );
}
