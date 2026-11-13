# Публикация Voli в Google Play и App Store

Всё, что нужно для первой публикации: что уже готово, что сделать вам и
тексты для карточек магазинов. Mac не нужен: iOS собирается в облаке Codemagic.

## Что готово в проекте

| Что | Где |
|---|---|
| ID приложения | `uz.voli.app` (Android и iOS) |
| Иконка | Voli: зелёная V с молнией на почти чёрном (логотип владельца, с 10.11.2026) |
| Подписанный AAB для Google Play | `marketing/store/voli-1.0.0.aab` (пересобран 14.11.2026: зелёный логотип, номер сборки 2, ключ `voli-upload`) |
| Ключ загрузки Android | `signing/voli-upload.jks`, пароль в `signing/README.txt` — **сделайте резервную копию** |
| Облачные сборки | `codemagic.yaml`: `ios-release` (→ TestFlight) и `android-release` (→ AAB) |
| Удаление аккаунта в приложении | Профиль → внизу «Удалить аккаунт» |
| Страница удаления для Google | https://app.voli.uz/delete-account.html |
| Политика конфиденциальности | https://voli.uz/?doc=privacy |
| Скриншоты | `marketing/store/ios-6.9/` (1320×2868), `marketing/store/android/` (1080×1920) — 8 штук в зелёном стиле (пересняты 14.11.2026): приветствие, вход, карта, станция, зарядка, скидки, «Приведи друга», поддержка |
| iOS | только iPhone, только портрет; CarPlay включим после разрешения Apple |

## Данные компании для регистрации

Как в свидетельстве (guvohnoma) и в D-U-N-S — латиницей, без «Voli»:

| Поле | Значение |
|---|---|
| Юридическое название (Legal entity name) | VOLI ENERGY LLC (по-узбекски «VOLI ENERGY» MCHJ) |
| ИНН / STIR | 311902334 |
| Дата регистрации | 10.02.2025 |
| Адрес | 123A Al-Xorazmiy street, Shahriobod MFY, Samarkand, Samarkand region, 140100, Uzbekistan |
| D-U-N-S | заявка отправлена 05.11.2026 через Apple, ждём номер на info@voli.uz |
| Сайт | https://voli.uz |
| Почта | info@voli.uz |

Название компании совпадает с брендом — переименовывать ничего не нужно.

## Регистрация на компанию VOLI ENERGY

Решение владельца (08.11.2026): оба магазина открываем **на компанию**, разработчиком
в карточке будет VOLI ENERGY. Для этого обоим магазинам нужен **номер D-U-N-S**
(заявка отправлена 05.11.2026 через Apple, обычно приходит за 5–14 рабочих дней на info@voli.uz).

| | Google Play Console | Apple Developer Program |
|---|---|---|
| Где | play.google.com/console | приложение **Apple Developer** на iPhone или developer.apple.com/enroll |
| Тип | Организация (Organization) | Organization |
| Цена | $25 один раз | $99 в год |
| Нужно | D-U-N-S, данные компании, телефон и почта компании, сайт voli.uz | D-U-N-S, юрназвание как в D-U-N-S, сайт на домене компании (voli.uz), рабочая почта на этом домене (info@voli.uz), право подписи за компанию |
| Проверка | 2–7 дней | Apple звонит на телефон компании для подтверждения, 2–14 дней |
| Плюс | **нет** требования «12 тестировщиков 14 дней» — можно публиковать сразу после проверки | разработчиком указана компания |

**Пока ждём D-U-N-S:** проверьте почту info@voli.uz (письмо от Dun & Bradstreet или Apple).
Номер можно поискать самим: developer.apple.com/enroll/duns-lookup — ввести данные компании
как в таблице выше. Как только номер есть — регистрируемся в обоих магазинах в тот же день.

Название, адрес и юридическая форма в магазинах должны **точно совпадать** с записью
D-U-N-S, иначе проверку не пройти.

Пароли, коды и данные карты вводите только сами — в чат их не присылайте.

## Google Play

1. **Аккаунт**: play.google.com/console → тип «Организация», данные компании и D-U-N-S.
   У аккаунта организации нет требования «12 тестировщиков 14 дней».
2. **Создать приложение**: название «Voli», язык по умолчанию — русский, «Приложение», «Бесплатное».
3. **Загрузить AAB**: Тестирование → Закрытое (или Внутреннее) → Создать выпуск →
   загрузить `marketing/store/voli-1.0.0.aab`. Подпись приложения Google Play — согласиться.
4. **Карточка**: тексты ниже, иконка 512×512 (`public/icon-512.png`), графика 1024×500
   (`marketing/store/feature-graphic.png`), скриншоты из `marketing/store/android/`.
5. **Анкеты** (Policy → App content):
   - Политика конфиденциальности: `https://voli.uz/?doc=privacy`
   - Удаление аккаунта: `https://app.voli.uz/delete-account.html`
   - Доступ к приложению: «Часть функций требует входа» → тестовый аккаунт (ниже).
   - Реклама: нет. Целевая аудитория: 18+. Новостное приложение: нет.
   - Безопасность данных — ответы ниже.
   - Финансовые функции: нет (оплата услуги зарядки, не финансовый продукт).

## App Store

1. **Apple Developer Program**: приложение Apple Developer на iPhone → Enroll →
   Organization: D-U-N-S, юрназвание, сайт voli.uz, почта info@voli.uz.
2. **App Store Connect** → Apps → «+» → New App: платформа iOS, имя «Voli»,
   основной язык русский, Bundle ID `uz.voli.app` (сначала зарегистрировать на
   developer.apple.com → Identifiers), SKU `voli-ios`.
3. **Ключ API для Codemagic**: App Store Connect → Users and Access → Integrations →
   App Store Connect API → «+» → роль App Manager. Скачать `.p8` (один раз!),
   записать Issuer ID и Key ID. В Codemagic: Teams → Integrations → Developer Portal →
   добавить ключ, имя **Voli ASC**.
4. **Apple ID приложения** (цифры: App Information → Apple ID) — вписать в
   `codemagic.yaml` вместо `APP_STORE_APPLE_ID: "0"` (или прислать мне).
5. **Сборка**: Codemagic → Start new build → `ios-release`. Через ~20 минут сборка
   появится в TestFlight.
6. **Карточка**: тексты ниже, скриншоты `marketing/store/ios-6.9/`, App Privacy — ответы ниже,
   возраст 4+, категория «Навигация» (вторая — «Путешествия»).
7. **App Review Information**: тестовый аккаунт и заметка для проверяющих (ниже) → Submit for Review.

## Тестовый аккаунт для проверяющих

Проверяющие входят по паролю: на первом экране «Войти» → вкладка «По паролю».
Демо-водитель рабочего сервера: `+998901234567` / `Driver2026` — у него есть баланс.
Надёжнее завести отдельного водителя для проверки и пополнить ему кошелёк в админке
на 50 000 сум. Номер и пароль впишите в Play Console (App access) и App Store Connect
(Sign-in required). В чат пароль не присылайте.

**Заметка для проверяющих (Review notes):**

> Voli is an EV charging app for Uzbekistan. It aggregates charging stations of partner
> networks on one map: drivers find a free connector, start and stop charging and pay from
> the Voli wallet (Payme / Click — payment for a physical charging service, not digital
> content). Location is used to show nearby stations; the camera scans the QR code on a
> charger. The demo account above has a wallet balance so a charge can be started at any
> station marked "Свободно". Sign in: on the first screen tap "Войти", then the "По паролю" tab.
> Account deletion: Profile → "Удалить аккаунт" at the bottom.

## Тексты карточки

### Русский

**Название (30):** Voli — зарядка электромобилей
**Подзаголовок iOS (30):** Все станции на одной карте
**Краткое описание Google (80):** Все зарядные станции Узбекистана в одном приложении: найди, заряди, оплати.

**Полное описание:**

Voli — все зарядные станции для электромобилей Узбекистана в одном приложении.

Больше не нужно ставить отдельное приложение для каждой сети. В Voli собраны станции сетей-партнёров: смотрите, где свободно, заряжайтесь и платите из одного кошелька.

• Карта станций — свободные разъёмы, мощность и цена за кВт·ч в реальном времени
• Старт зарядки в одно нажатие или по QR-коду на станции
• Прогресс зарядки, время до цели и уведомление, когда машина готова
• Оплата через Payme и Click, чеки и история зарядок
• Скидки и акции — значком «%» на карте, применяются сами
• Бронь разъёма и очередь, если всё занято
• Бонусы: 50 000 сум за данные машины и 50 000 за паспорт, по 20 000 вам и другу за приглашение
• Зарядка в долг: заряжайтесь сейчас — платите позже
• Поиск станций по маршруту и офлайн-карты для трассы
• Поддержка в чате: ИИ-помощник отвечает сразу, специалист — в сложных случаях
• Кнопка SOS в дороге

Voli работает на русском, узбекском и английском.

**Ключевые слова iOS (100):** зарядка,электромобиль,станция,EV,зарядная,Tashkent,Ташкент,BYD,Zeekr,Tesla,заряд,kWh

### O‘zbekcha

**Nomi:** Voli — elektromobil zaryadlash
**Подзаголовок iOS (30):** Hamma stansiyalar bir xaritada
**Qisqa tavsif:** Barcha zaryadlash stansiyalari bitta ilovada: toping, zaryadlang, to‘lang.
**Ключевые слова iOS (100):** zaryadlash,elektromobil,stansiya,EV,quvvatlash,Toshkent,BYD,Zeekr,Tesla,kVt

**To‘liq tavsif:**

Voli — O‘zbekistondagi elektromobillar uchun barcha zaryadlash stansiyalari bitta ilovada.

Endi har bir tarmoq uchun alohida ilova o‘rnatish shart emas. Voli’da hamkor tarmoqlar stansiyalari jamlangan: qayerda bo‘sh ekanini ko‘ring, zaryadlang va bitta hamyondan to‘lang.

• Stansiyalar xaritasi — bo‘sh ulagichlar, quvvat va kVt·soat narxi real vaqtda
• Bir bosishda yoki stansiyadagi QR-kod orqali zaryadlashni boshlash
• Zaryadlash jarayoni va mashina tayyor bo‘lganda bildirishnoma
• Payme va Click orqali to‘lov, cheklar va tarix
• Chegirmalar va aksiyalar — xaritada «%» belgisi bilan
• Ulagichni bron qilish va navbat
• Bonuslar: mashina ma’lumotlari va pasport uchun 50 000 so‘mdan, taklif uchun sizga va do‘stingizga 20 000 so‘mdan
• Qarzga zaryadlash: hozir zaryadlang — keyin to‘lang
• Yo‘nalish bo‘yicha stansiyalar va oflayn xaritalar
• Chatda yordam: SI-yordamchi darhol javob beradi
• Yo‘lda SOS tugmasi

### English

**Name:** Voli — EV charging
**Подзаголовок iOS (30):** Every station on one map
**Ключевые слова iOS (100):** EV,charging,charger,electric car,station,Tashkent,Uzbekistan,BYD,Zeekr,Tesla,kWh
**Short description:** Every EV charging station in Uzbekistan in one app: find, charge, pay.

**Full description:**

Voli brings every EV charging station in Uzbekistan into one app.

No more separate apps for every network. Voli gathers the stations of partner networks: see what is free, charge and pay from one wallet.

• Live map — free connectors, power and price per kWh
• Start charging with one tap or by the QR code on the charger
• Charging progress and a notification when the car is ready
• Pay with Payme or Click; receipts and history
• Deals and promotions, applied automatically
• Book a connector or join the queue
• Bonuses: 50,000 UZS each for your car’s details and your passport, 20,000 each for you and a friend you invite
• Charge now, pay later
• Stations along your route and offline maps
• Chat support: an AI assistant answers at once
• SOS button on the road

## Безопасность данных (Google) и App Privacy (Apple)

Данные шифруются при передаче (HTTPS). Пользователь может удалить аккаунт. Данные не продаются и не передаются для рекламы, трекинга нет.

| Данные | Собирается | Зачем | Связано с пользователем |
|---|---|---|---|
| Имя | да | работа приложения, аккаунт | да |
| Номер телефона | да | вход, аккаунт | да |
| Адрес электронной почты | да, если входят по почте | вход по коду, аккаунт | да |
| Точное местоположение | да, только когда приложение открыто | станции рядом | нет (не сохраняется) |
| Фото | да, по желанию | фото проблемы для поддержки, лицо для зарядки в долг | да |
| История покупок | да | зарядки и платежи | да |
| Платёжные данные карты | нет — оплата у Payme/Click | — | — |
| Сообщения в поддержку | да | поддержка | да |
| Сведения об автомобиле (марка, модель, госномер) | да, по желанию | подбор разъёмов, бонус | да |
| Паспорт: серия, 3 последние цифры, дата рождения (ПИНФЛ — только хеш) | да, по желанию | бонус один раз на человека, защита от злоупотреблений | да |
| Диагностика (ошибки) | да | стабильность (Sentry) | нет |

Google Data safety: паспорт отметьте в «Личная информация → Другая информация» (Other info), цель — «Предотвращение мошенничества, безопасность».

Apple App Privacy: «Data Used to Track You» — нет; «Data Linked to You» — Contact Info (Name, Phone, Email), Purchases, User Content (Photos, Customer Support), Identifiers (User ID), Other Data (паспорт, госномер); «Data Not Linked to You» — Location (Precise), Diagnostics.

## Что дальше (после первой версии)

- Нативные уведомления (Firebase + APNs): сейчас в приложении из магазина уведомления
  о зарядке не приходят, в браузере работают.
- CarPlay: запрос на developer.apple.com/carplay (категория EV Charging).
- Android Auto: Play Console → Advanced settings → Form factors.
