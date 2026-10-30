# Приложение Voli для Google Play и App Store

Нативная оболочка на Capacitor 8 (`capacitor.config.ts`). Внутри открывается
боевой сайт Voli (`CAP_SERVER_URL`; сейчас `https://charge-qogf.onrender.com`, после запуска домена — `https://voli.uz`: поменять там же, в `voli_server` у Android и `VoliServer`/`WKAppBoundDomains` у iOS):
у водителей всегда последняя версия, а вход, API, офлайн-трассы и QR-сканер
работают так же, как в вебе. Сборка сайта из `dist/` лежит в приложении
запасным вариантом.

Нативное поверх веба:

| Что | Где | Статус |
|---|---|---|
| Android Auto (категория «зарядка») | `android/app/src/main/java/uz/voli/app/car/` | собирается, проверить на машине или в DHU |
| CarPlay (EV Charging) | `ios/App/App/CarPlaySceneDelegate.swift`, `App.entitlements` | код готов, нужен Mac и разрешение Apple |
| Геолокация, камера, уведомления | разрешения в `AndroidManifest.xml` и `Info.plist` | готово |
| Нативные push (FCM/APNs) | — | следующий шаг, см. ниже |

## Команды

```bash
npm run app:sync      # собрать сайт и скопировать в android/ и ios/
npm run app:android   # открыть в Android Studio
npm run app:ios       # открыть в Xcode (только на Mac)
```

Отладочная сборка Android без Android Studio:

```bash
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Android Auto

- Сервис `VoliCarAppService` в категории `androidx.car.app.category.CHARGING`,
  экран `StationsScreen`: до 6 станций рядом (свободные выше), «2/4 свободно ·
  до 150 кВт · от 1 800 сум», зелёные/красные метки на карте машины, по нажатию —
  навигация в приложении карт машины. Обновляется раз в минуту.
- Адрес сервера — строка `voli_server` в `res/values/strings.xml`.
- Проверка без машины: Desktop Head Unit (SDK Manager → Android Auto Desktop
  Head Unit Emulator), на телефоне — режим разработчика Android Auto →
  «Unknown sources».
- В Google Play: Play Console → Advanced settings → Form factors → Android Auto,
  пройти проверку качества для приложений зарядки.

## CarPlay

- Сцена `CarPlaySceneDelegate` (`CPPointOfInterestTemplate`): станции рядом,
  статус и цена, кнопка «Маршрут» открывает Карты.
- Нужно разрешение Apple **CarPlay EV Charging App**: запрос на
  developer.apple.com/carplay → после одобрения включить capability в профиле
  приложения. Без него Xcode не подпишет `com.apple.developer.carplay-charging`.
- Собирается только на Mac (Xcode 16+). Проверка — CarPlay Simulator из
  Additional Tools for Xcode.

## Перед публикацией

1. Аккаунты: Google Play Developer (25 $ разово), Apple Developer Program (99 $ в год).
2. Иконки и заставка: `npx @capacitor/assets generate` из логотипа 1024×1024.
3. Подпись Android: ключ загрузки (`keytool`), `signingConfigs` в `android/app/build.gradle`, сборка `bundleRelease` → `.aab`.
4. Нативные push: Firebase-проект → `google-services.json` в `android/app/`,
   APNs-ключ в Apple Developer, плагин `@capacitor/push-notifications`, и на
   сервере отправка через FCM рядом с Web Push (`server/push.js`). Уведомление
   о зарядке на экране блокировки в iOS — Live Activity (ActivityKit), в
   Android — постоянное уведомление с прогрессом.
5. Политика конфиденциальности в сторах — та же, что на сайте (`/?doc=privacy`).
