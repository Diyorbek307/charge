# iPhone: живая карточка зарядки (Live Activity)

Карточка на экране блокировки и в Dynamic Island — как на Android: процент, полоса
заряда, энергия, стоимость, мощность. Код готов, но в сборку iOS не включён, потому что
нужен Mac (или Codemagic с правками проекта) и аккаунт Apple Developer.

## Что уже сделано

| Часть | Где |
|---|---|
| Вид карточки (SwiftUI, цвета Voli) | `ios/VoliLiveActivity/Widget/ChargeLiveActivity.swift` |
| Данные карточки (общие для приложения и виджета) | `ios/VoliLiveActivity/Shared/ChargeAttributes.swift` |
| Мост из веб-приложения в ActivityKit | `ios/VoliLiveActivity/App/LiveActivityPlugin.swift` |
| Запуск карточки при старте зарядки | `src/lib/liveActivity.ts` (вызывается из экрана зарядки) |
| Обновления через Apple, когда приложение закрыто | `server/apns.js`, `server/push.js` (`sendLiveCard`) |
| Регистрация токена карточки | `POST /api/push/live-activity` |

Пока плагина нет в сборке, приложение просто не показывает карточку — ничего не ломается.

## Как включить (один раз, ~15 минут на Mac с Xcode)

1. Открыть `ios/App/App.xcworkspace` (или `App.xcodeproj`) в Xcode.
2. **File → New → Target → Widget Extension**, имя `VoliLiveActivity`, галочка
   **Include Live Activity**. Созданные шаблоны удалить, вместо них добавить в target
   `VoliLiveActivity` файлы из `ios/VoliLiveActivity/Widget/` и `Shared/`.
3. `Shared/ChargeAttributes.swift` добавить **и в target App** (галочка Target Membership).
4. `App/LiveActivityPlugin.swift` добавить в target **App**. Capacitor 8 находит плагины
   с `CAPBridgedPlugin` сам; если нет — зарегистрировать в `capacitor.config.json` →
   `packageClassList` строку `LiveActivityPlugin`.
5. В `ios/App/App/Info.plist` добавить `NSSupportsLiveActivities` = `YES` и
   `NSSupportsLiveActivitiesFrequentUpdates` = `YES`.
6. Target App → Signing & Capabilities → **+ Push Notifications**.
7. Минимальная версия iOS для виджета — 16.2.
8. Собрать в Codemagic как обычно (`ios-release`).

## Ключ Apple для обновлений с сервера

1. developer.apple.com → Certificates, IDs & Profiles → **Keys** → «+» →
   **Apple Push Notifications service (APNs)** → скачать файл `.p8` (скачивается один раз).
2. В Render → charge → Environment:
   - `APNS_KEY` — весь текст файла `.p8`
   - `APNS_KEY_ID` — id ключа (10 символов)
   - `APNS_TEAM_ID` — Team ID (Membership)
   - `APNS_TOPIC` — `uz.voli.app`
   - `APNS_SANDBOX` — `true` для сборок из Xcode/TestFlight-разработки, иначе не задавать
3. Проверка: начать зарядку на iPhone, свернуть приложение — карточка должна обновляться
   на каждые 5% (настройка «Обновлять уведомление о зарядке каждые» в админке).

Код сервера написан по документации Apple и ещё не проверен на настоящем iPhone —
первую проверку сделать на TestFlight-сборке.
