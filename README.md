# Charge

Стартовый каркас приложения. Готов к деплою на [Render](https://render.com).

## Локальный запуск

```bash
npm install
npm start
```

Открой http://localhost:3000

## Деплой на Render

Проект содержит `render.yaml`, поэтому Render настроит всё автоматически:

1. Зайди на [render.com](https://render.com) и войди через GitHub.
2. **New → Web Service** и выбери репозиторий `Diyorbek307/charge`.
3. Render сам подхватит настройки:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Нажми **Create Web Service** — при каждом `git push` деплой обновляется автоматически.
