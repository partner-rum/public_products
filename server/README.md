# Бэкенд витрины на своём сервере

Тот же `bot/worker.js`, что уезжает в Cloudflare, запущенный на нашем VPS. Код воркера
**не переписан**: `server.mjs` даёт ему привычное окружение — `env` с хранилищем, лимитер
и `waitUntil`, — а хранилище `kv.mjs` повторяет интерфейс Cloudflare KV поверх SQLite.

Почему так, а не переносом функций: в воркере 4837 строк, и самое тонкое в нём — не
маршруты, а утренний конвейер (линты, дедупы, промпты). Переписывание такого кода
означало бы регрессии в том, что сейчас работает; вместо этого меняется окружение,
а тесты воркера продолжают проверять ровно тот код, что стоит в бою.

## Что нужно на сервере

- Node 24+ (в нём встроен `node:sqlite`, поэтому `npm install` не требуется — зависимостей ноль)
- `sqlite3` (только для бэкапа)

## Установка

1. Пользователь и каталоги:

```
useradd --system --no-create-home --shell /usr/sbin/nologin rumberg
mkdir -p /var/lib/rumberg /var/backups/rumberg
chown rumberg:rumberg /var/lib/rumberg /var/backups/rumberg
chmod 750 /var/lib/rumberg
```

2. Файл с секретами `/etc/rumberg-api.env` — по строке `ИМЯ=значение`, без кавычек:

```
chmod 600 /etc/rumberg-api.env
chown root:root /etc/rumberg-api.env
```

Переменные (имена совпадают с теми, что заведены у воркера в Cloudflare):

| Переменная | Зачем |
|---|---|
| `BOT_TOKEN` | бот @Rumberb_Sales_Team_bot |
| `CHAT_ID` | группа продаж, куда падают заявки |
| `ADMIN_CHAT_ID` | личка для карточек модерации |
| `ANALYST_CHAT_ID` | доверенные отправители статьи (через запятую) |
| `SALES_KEYS` | ключи сейлзов (`имя:ключ,имя:ключ`) — открывают админку |
| `PARTNER_KEYS` | старые ключи партнёров; новые живут в базе |
| `WEBHOOK_SECRET` | заголовок вебхука Telegram |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` | коммиты данных через GitHub API |
| `DEEPSEEK_API_KEY`, `CHAT_PROVIDER`, `DEEPSEEK_MODEL` | ассистент и конвейер |
| `ALLOW_ORIGIN` | `https://invest.rumberg.ru` |
| `SITE_BASE` | `https://invest.rumberg.ru/` |
| `CHANNEL_ID`, `FI_CHANNEL_ID` | каналы публикации (необязательно) |
| `BOSS_KEY` | запасной вход в кабинет владельца (необязательно) |
| `RATE_PER_MIN` | лимит на IP для чата, по умолчанию 15 |

**Восемь значений из Cloudflare прочитать нельзя** — они там `secret_text`:
`BOT_TOKEN`, `CHAT_ID`, `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`, `SALES_KEYS`,
`WEBHOOK_SECRET`, `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`. Их надо взять из
первоисточников (BotFather, кабинеты DeepSeek и GitHub) или назначить заново.
Яндексовые не нужны — это отключённый резервный провайдер.

3. Юниты:

```
cp /srv/site/server/rumberg-api.service /etc/systemd/system/
cp /srv/site/server/rumberg-cron.service /etc/systemd/system/
cp /srv/site/server/rumberg-cron.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now rumberg-api
systemctl status rumberg-api --no-pager
```

Расписание cron в `rumberg-cron.timer` **сверить** с тем, что стоит у воркера в
Cloudflare (Settings → Triggers) и с часовым поясом сервера (`timedatectl`).

4. Бэкап в crontab root:

```
5 4 * * * /srv/site/server/backup.sh >> /var/log/rumberg-backup.log 2>&1
```

## Перенос данных из Cloudflare KV

Делается ОДИН раз, до переключения. Хранилище общее для всех маршрутов, поэтому
переключать их по одному нельзя: сделку заведёт админка через Cloudflare, а стол
партнёра прочитает её из SQLite — и не найдёт.

На машине с wrangler (значения ключей не покидают её):

```
npx wrangler kv key list --namespace-id=<id> --remote > kvkeys.json
# ключи без hit:/act:/deskhit: — у событий вся нагрузка в metadata
npx wrangler kv bulk get keys_need.json --namespace-id=<id> --remote > kvvalues.json
```

Дальше на сервере:

```
node /srv/site/server/import_kv.mjs kvkeys.json kvvalues.json /var/lib/rumberg/kv.db
```

Импорт идемпотентен и в конце печатает сверку: сколько ключей было, сколько легло,
совпали ли значения, metadata и сроки. Расхождения = переключать нельзя.

## Переключение трафика

В `/etc/nginx/sites-available/invest` у `location /api/` заменить

```
proxy_pass https://so-leads.ruslan-sabirov.workers.dev/;
```

на

```
proxy_pass http://127.0.0.1:8080/;
```

Заголовки `Host`, `proxy_ssl_server_name` при этом убрать (они нужны только для
Cloudflare), `X-Real-IP` — ОСТАВИТЬ: адаптер берёт из него адрес клиента и кладёт в
`CF-Connecting-IP`, откуда воркер его читает. Дальше `nginx -t && systemctl reload nginx`.

Вебхук Telegram перевести на наш домен (он идёт мимо `/api/`, поэтому нужен свой
`location /tg`):

```
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook"   -d "url=https://invest.rumberg.ru/tg"   -d "secret_token=<WEBHOOK_SECRET>"
```

## Проверка после переключения

```
curl -s -X POST https://invest.rumberg.ru/api/chat -H "Origin: https://invest.rumberg.ru"   -H "Content-Type: application/json" -d "{}"          # ждём 422 empty
curl -s -X POST https://invest.rumberg.ru/api/stats -H "Origin: https://invest.rumberg.ru"   -H "Content-Type: application/json" -d '{"id":"x","key":"y"}'   # ждём 403 bad_key
journalctl -u rumberg-api -n 30 --no-pager
```

## Откат

Вернуть `proxy_pass` на `workers.dev` и `setWebhook` на адрес воркера. **Окно отката
ограничено:** всё, что записалось в SQLite, в Cloudflare KV не попадёт, поэтому
откат безопасен только пока новых сделок и заявок не было. Переключаться лучше
вечером или в выходные.

## Что важно помнить

- **Хранилище общее.** Маршруты делят префиксы: сделки пишет `/submit`, читают
  `/stats`, `/boss` и `/chat`; реквизиты и ключи входа пишет `/tg`. Половинчатое
  переключение разведёт данные по двум хранилищам.
- **`get(key, "json")`.** Воркер зовёт хранилище и строкой типа, и объектом.
  `kv.mjs` понимает оба вида; пока понимал только объект, книга сделок читалась
  строкой, и её длина в байтах попадала в кабинет владельца как число сделок.
- **`CF-Connecting-IP`** подставлять в запросы К Cloudflare нельзя (там 403), а здесь
  наоборот: адаптер сам кладёт в него адрес из `X-Real-IP`.
- **Ошибки хранилища воркер местами глотает** пустым `catch`, поэтому адаптер их
  логирует сам. Трассировка обращений — `KV_TRACE=1`.
- Тест хранилища: `node server/kv_test.mjs` (32 проверки).
