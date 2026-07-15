# Telegram-бот для заявок с сайта

Форма «Обсудить продукт» на сайте отправляет заявку в этот Cloudflare Worker, а он пересылает её
в Telegram — в личку менеджеру или (рекомендуется) в общую группу продаж, чтобы лид видели все.

Токен бота хранится секретом в Worker'е и **никогда не попадает в код сайта**.

```
Форма на сайте  ──POST /lead──▶  Worker (BOT_TOKEN)  ──▶  Telegram Bot API  ──▶  группа продаж
```

## Что нужно (10–15 минут)

### 1. Создать бота
1. В Telegram открыть **@BotFather** → `/newbot` → задать имя и логин (напр. `nordstar_leads_bot`).
2. Скопировать **токен** вида `1234567890:AA...`.

### 2. Куда падают заявки — создать группу продаж
1. Создать группу в Telegram, добавить туда сейлзов и **самого бота**.
2. Узнать `chat_id` группы: добавить в неё бота **@getidsbot** (или @userinfobot) — он покажет id
   (у групп он отрицательный, напр. `-1001234567890`). Бота-помощника потом можно удалить.
   - Для лички менеджера: написать боту, затем открыть
     `https://api.telegram.org/bot<ТОКЕН>/getUpdates` и взять `chat.id`.

### 3. Задеплоить Worker
Нужен бесплатный аккаунт Cloudflare и Node.

```bash
cd bot
npm i -g wrangler          # если ещё нет
wrangler login             # вход в Cloudflare (браузер)
wrangler secret put BOT_TOKEN     # вставить токен из шага 1
wrangler secret put CHAT_ID       # вставить chat_id из шага 2
wrangler deploy
```

Получите URL вида `https://so-leads.<ваш-субдомен>.workers.dev`.
Проверка: `curl -X POST https://.../lead -H "Content-Type: application/json" -d '{"contact":"тест"}'`
— в группе должно появиться сообщение «Заявка с сайта».

### 4. Включить на сайте
В `contact.js` (в корне сайта) заполнить `CFG`:

```js
var CFG = {
  botUser: "nordstar_leads_bot",                       // логин бота без @ (для кнопки Telegram)
  waPhone: "79990000000",                              // WhatsApp менеджера (или "" чтобы скрыть)
  endpoint: "https://so-leads.<...>.workers.dev/lead"  // URL Worker'а + /lead
};
```

Готово — форма-заявка уходит в Telegram. Пункты «Telegram»/«WhatsApp» появляются, если заполнены `botUser`/`waPhone`.

### 5. (Опционально) Кнопка «Написать в Telegram» с приветствием бота
Чтобы клиент, нажавший «Написать в Telegram», сразу получал приветствие от бота с контекстом
продукта, а лид падал в группу — подключите вебхук:

```bash
wrangler secret put WEBHOOK_SECRET        # придумать любую строку
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://so-leads.<...>.workers.dev/tg&secret_token=<ТА_ЖЕ_СТРОКА>"
```

Без этого шага кнопка Telegram просто открывает чат с ботом (заявки всё равно работают через форму).

## Безопасность
- Токен и chat_id — только в секретах Worker'а (`wrangler secret put`), не в репозитории.
- `ALLOW_ORIGIN` в `wrangler.toml` можно сузить до вашего домена, чтобы форму дёргал только сайт.
- Персональные данные лидов (телефон/имя) — учтите 152-ФЗ: для хранения в РФ можно вместо Cloudflare
  использовать Yandex Cloud Functions с тем же кодом (логика идентична).
