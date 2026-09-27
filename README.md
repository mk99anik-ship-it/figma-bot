# Canvas AI

Веб-интерфейс AI-бота для генерации редактируемых макетов в Figma.

## Локальный запуск

Откройте `index.html` в браузере или запустите любой статический сервер из корня проекта:

```bash
python3 -m http.server 4173
```

Сейчас без настройки API генерация работает в demo-режиме.

## Подключение Worker и Figma Plugin

1. Установите Wrangler и выполните `wrangler login`.
2. Создайте D1-базу: `wrangler d1 create canvas-ai`.
3. Подставьте `database_id` в `worker/wrangler.toml` и выполните миграцию:

```bash
wrangler d1 migrations apply canvas-ai --config worker/wrangler.toml
```

4. Разверните Worker:

```bash
wrangler deploy --config worker/wrangler.toml
```

5. Замените `https://canvas-ai-worker.example.workers.dev` в `figma-plugin/ui.html` и `figma-plugin/manifest.json` на URL Worker.
6. Перед подключением API добавьте на страницу `window.CANVAS_API_BASE = "https://your-worker.workers.dev"` и загрузите `app.js`.
7. Импортируйте `figma-plugin/manifest.json` через Figma Desktop: `Plugins → Development → Import plugin from manifest`.

После генерации веб-приложение выдаёт одноразовый код. Откройте плагин в нужном Figma-файле, вставьте код и плагин создаст редактируемые слои на текущей странице.

Без `AI` binding Worker использует демонстрационный дизайн. Для Cloudflare Workers AI binding уже описан в `worker/wrangler.toml`; перед production нужно заменить `database_id`, домен плагина и включить авторизацию пользователей.