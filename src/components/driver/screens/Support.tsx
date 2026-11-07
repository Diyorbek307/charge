// Moved out of DriverApp.tsx: SupportScreen.
import { useState } from 'react';
import { ChevronRight, ArrowLeft, ChevronDown, Plus, AlertTriangle, Send } from 'lucide-react';
import { BRAND } from '../../../brand';
import { usePlatform } from '../../../lib/platform';
import SupportChat from '../SupportChat';

export function SupportScreen({ onBack, onReport }: { onBack: () => void; onReport: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const platform = usePlatform();
  const faqs = [
    { q: 'Как начать зарядку?', a: 'Найдите станцию на карте или отсканируйте QR-код на ней → «Начать зарядку» → выберите разъём и способ оплаты → подтвердите. Подключите кабель к машине — зарядка начнётся, когда станция её подтвердит.' },
    { q: 'Почему зарядка не началась?', a: 'Частые причины: разъём занят или забронирован, на кошельке не хватает на 5 кВт·ч, исчерпан лимит компании. Текст ошибки на экране подскажет, что именно. Если станция неисправна — сообщите о проблеме, оператор получит оповещение сразу.' },
    { q: 'Как пополнить кошелёк?', a: 'Профиль → Кошелёк → Пополнить через Payme, Click, Uzum или Humo. Или в приложении Paynet и терминалах — по номеру счёта из окна пополнения. Деньги зачисляются, когда платёжная система подтвердит оплату. Данные карт мы не храним — их обрабатывает платёжная система.' },
    { q: 'Сколько стоит зарядка?', a: 'Цену за кВт·ч задаёт оператор станции, она видна на карточке разъёма. Ночью (23:00–07:00) — ×0,7, днём (10:00–17:00) — ×0,9, вечером в пик (17:00–22:00) — ×1,25. Тариф фиксируется в момент старта, оплата — по фактической энергии.' },
    { q: 'Как работает бронь?', a: `Бронь держит разъём за вами ${platform.booking.graceMin} минут после назначенного времени и стоит ${platform.booking.fee.toLocaleString('ru-RU')} сум (с Voli Plus — бесплатно). Если отменить до начала окна — плата возвращается на кошелёк.` },
    { q: 'Я сотрудник компании-клиента. Как заряжаться за счёт компании?', a: 'Если ваш номер привязан к автопарку компании, при старте зарядки появится вариант «За счёт компании» и остаток вашего месячного лимита. Лимит меняет менеджер автопарка.' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Поддержка</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <SupportChat />
        <button onClick={onReport} className="w-full bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3 text-left">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><AlertTriangle size={18} className="text-amber-600" /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">Проблема на станции</p>
            <p className="text-xs text-slate-500">Сообщение сразу уходит оператору станции</p>
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </button>

        <p className="text-xs font-semibold text-slate-400 tracking-widest px-1 pt-1">ЧАСТЫЕ ВОПРОСЫ</p>
        {faqs.map((faq, i) => (
          <div key={faq.q} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} className="w-full px-4 py-3.5 flex items-center justify-between text-left">
              <span className="text-sm font-medium text-slate-800 flex-1 pr-2">{faq.q}</span>
              <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
            </button>
            {openFaq === i && <p className="px-4 pb-4 text-sm text-slate-500 leading-relaxed pg-reveal">{faq.a}</p>}
          </div>
        ))}

        <a href={`mailto:${BRAND.emails.support}`} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center shrink-0"><Send size={17} className="text-sky-600" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{BRAND.emails.support}</p>
            <p className="text-xs text-slate-400">Напишите нам — укажите номер телефона и, если есть, номер зарядки из чека</p>
          </div>
        </a>
      </div>
    </div>
  );
}
