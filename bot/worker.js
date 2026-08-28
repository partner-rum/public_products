// Cloudflare Worker: заявки с сайта + Telegram-бот → лиды в Telegram менеджеру/группе продаж.
//
// Секреты (задаются командой `wrangler secret put ...`, В КОД НЕ ПОПАДАЮТ):
//   BOT_TOKEN         — токен бота от @BotFather
//   CHAT_ID           — id чата/группы продаж, куда падают заявки (напр. -1001234567890)
//   WEBHOOK_SECRET    — (опц.) секрет вебхука Telegram; если задан — проверяется заголовок
//   ALLOW_ORIGIN      — (опц.) домен сайта для CORS, напр. https://invest.rumberg.ru. По умолчанию "*"
//   CHAT_PROVIDER     — (опц.) провайдер ИИ для /chat: "yandex" (по умолчанию), "deepseek" или "claude".
//   DEEPSEEK_API_KEY  — (deepseek) ключ platform.deepseek.com. DEEPSEEK_MODEL — по умолчанию "deepseek-chat".
//   YANDEX_API_KEY    — (yandex) API-ключ сервисного аккаунта Yandex Cloud (роль ai.languageModels.user).
//   YANDEX_FOLDER_ID  — (yandex) идентификатор каталога (folder) в Yandex Cloud.
//   YANDEX_MODEL      — (опц.) модель Yandex, по умолчанию "yandexgpt/latest" (последняя Pro); напр. "yandexgpt/rc".
//   ANTHROPIC_API_KEY — (claude, запасной) ключ Claude API. Нужен только при CHAT_PROVIDER=claude.
//   CHAT_MODEL        — (опц.) модель Claude, по умолчанию claude-haiku-4-5.
//   CHAT_RATE_LIMIT   — (опц.) биндинг Rate Limiting (Worker → Settings → Bindings → Rate limiting)
//                        для антиспама на /chat, напр. 15 запросов / 60 сек с одного IP. При превышении — 429.
//   CHAT_LOG_CHAT_ID  — (опц.) id TG-чата/канала для лога вопросов AI-чата (без контактов:
//                        вопрос/ответ/страница). Не задан — лог не ведётся.
//   CHAT_BLOCKED_COUNTRIES — (опц.) страны (ISO-2, через запятую), где AI-чат отключён. По умолчанию ПУСТО
//                            (открыто для всех). Чтобы ограничить — задай "RU" или "RU,BY": тем клиентам
//                            /chat вернёт region_unavailable, и виджет предложит Telegram.
//
//   --- админка сейлзов (добавление продуктов на сайт) ---
//   SALES_KEYS      — персональные ключи сейлзов: "andrey:ключ1,polina:ключ2" (секрет)
//   ADMIN_CHAT_ID   — личный chat_id Руслана (модератора) — карточки на аппрув идут сюда, не в группу
//   GITHUB_TOKEN    — fine-grained токен ТОЛЬКО на этот репозиторий, права Contents: Read and write (секрет)
//   GITHUB_REPO     — напр. "partner-rum/public_products"; GITHUB_BRANCH — по умолчанию "main"
//   WEBHOOK_SECRET  — ОБЯЗАТЕЛЕН для кнопок ✅/❌: без него /tg не защищён от поддельных approve
//
//   --- утренний пост (статья аналитика → новости + продукты дня) ---
//   ANALYST_CHAT_ID — (опц.) chat_id доверенных отправителей статьи, МОЖНО НЕСКОЛЬКО через
//                     запятую ("123,456"). Их длинные сообщения (≥600 знаков) в личке бота
//                     считаются утренней статьёй; готовый пост возвращается ОТПРАВИТЕЛЮ,
//                     он сам публикует его в канал (копипастой). Руслан (ADMIN_CHAT_ID)
//                     может слать статью и сам. Свой chat_id каждый узнаёт командой /id.
//   CHANNEL_ID      — (опц.) канал для кнопки «📢 В канал» у утреннего поста: "@имя_канала"
//                     или -100…-id. Бот должен быть админом канала с правом публикации.
//                     Не задан — кнопки нет, публикация копипастой как раньше.
//
// Маршруты:
//   POST /lead   — форма-заявка с сайта  → сообщение в CHAT_ID
//   POST /chat   — сообщение чат-ассистента → Claude API → ответ обратно на сайт
//   POST /submit — админка сейлзов: продукт → карточка с кнопками ✅/❌ в ADMIN_CHAT_ID
//   POST /tg     — вебхук Telegram: callback-кнопки модерации (✅ публикует коммитом в GitHub),
//                  /start <id> приветствует клиента и шлёт лид в CHAT_ID, прочее пересылает в CHAT_ID;
//                  длинный текст от ADMIN/ANALYST — утренняя статья → сжатый пост Руслану
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/lead" && request.method === "POST") return handleLead(request, env, cors);
    if (url.pathname === "/click" && request.method === "POST") return handleClick(request, env, cors);
    if (url.pathname === "/hit" && request.method === "POST") return handleHit(request, env, cors);
    if (url.pathname === "/stats" && request.method === "POST") return handleStats(request, env, cors);
    if (url.pathname === "/picks" && request.method === "POST") return handlePicks(request, env, cors);
    if (url.pathname === "/boss" && request.method === "POST") return handleBoss(request, env, cors);
    if (url.pathname === "/chat" && request.method === "POST") return handleChat(request, env, cors, ctx);
    if (url.pathname === "/submit" && request.method === "POST") return handleSubmit(request, env, cors, ctx);
    if (url.pathname === "/tg" && request.method === "POST") return handleTelegram(request, env, ctx);

    return new Response("OK", { status: 200, headers: cors });
  },

  // Cron Triggers (расписание задаётся в Cloudflare → Workers → Triggers → Cron).
  // Ежедневно генерим 3 короткие идеи постов для канала агентов и шлём Руслану в личку.
  async scheduled(event, env, ctx) {
    // Будни 10:00 МСК: если утренняя статья ещё не приходила — напоминание Руслану.
    // Сам пост собирается не по крону, а в момент, когда статья прилетает боту.
    ctx.waitUntil(morningCron(env).catch(() => {}));
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function tg(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}


function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...(cors || {}) } });
}

// --- Заявка с сайта ---
async function handleLead(request, env, cors) {
  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400, cors); }

  const name = String(data.name || "").trim().slice(0, 200);
  const contact = String(data.contact || "").trim().slice(0, 200);
  const product = String(data.product || "").trim().slice(0, 300);
  const segment = String(data.segment || "").trim().slice(0, 100);
  const page = String(data.url || "").trim().slice(0, 500);
  const chat = String(data.chat || "").trim().slice(0, 1500);
  const ref = String(data.ref || "").trim().slice(0, 60);
  if (!contact) return json({ ok: false, error: "no_contact" }, 422, cors);

  const text =
    "🟠 <b>Заявка с сайта</b>\n" +
    (ref ? "Сейлз: " + esc(ref) + "\n" : "") +
    (product ? "Продукт: " + esc(product) + "\n" : "") +
    (segment ? "Категория: " + esc(segment) + "\n" : "") +
    (name ? "Имя: " + esc(name) + "\n" : "") +
    "Контакт: " + esc(contact) +
    (page ? "\nСтраница: " + esc(page) : "") +
    (chat ? "\n\n<b>Диалог с ассистентом:</b>\n" + esc(chat) : "");

  const r = await tg(env, "sendMessage", {
    chat_id: env.CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true,
  });
  if (!r.ok) return json({ ok: false, error: "telegram_failed" }, 502, cors);
  // Заявка попадает и в кабинет агента — под тем же ключом продукта, что и открытия,
  // чтобы в таблице «открыли 12 раз, заявка 1» стояло одной строкой. Ошибку учёта
  // глотаем: заявка уже ушла сейлзам, ронять ответ из-за статистики нельзя.
  await recordHit(env, ref.toLowerCase(), productFromUrl(page), "lead");
  return json({ ok: true }, 200, cors);
}

// --- Отбивка о клике по кнопке (напр. «Telegram-группа» в шапке) ---
// Фронт шлёт navigator.sendBeacon; тело — text/plain JSON. Уведомление идёт
// Руслану в личку (ADMIN_CHAT_ID), при отсутствии — в группу (CHAT_ID).
async function handleClick(request, env, cors) {
  // Только с нашего сайта (если ALLOW_ORIGIN задан) — защита от постороннего спама.
  const origin = request.headers.get("Origin");
  if (env.ALLOW_ORIGIN && env.ALLOW_ORIGIN !== "*" && origin && origin !== env.ALLOW_ORIGIN) {
    return json({ ok: false, error: "forbidden_origin" }, 403, cors);
  }
  let data = {};
  try { data = await request.json(); } catch {}
  const label = String(data.label || "Telegram-группа").trim().slice(0, 80);
  const ref = String(data.ref || "").trim().slice(0, 60);
  const page = String(data.url || "").trim().slice(0, 300);
  const ua = String(data.ua || "").trim().slice(0, 200);
  const country = request.headers.get("cf-ipcountry") || "";

  const text =
    "🔵 <b>Клик по кнопке «" + esc(label) + "»</b>\n" +
    (ref ? "Сейлз: " + esc(ref) + "\n" : "") +
    (page ? "Страница: " + esc(page) + "\n" : "") +
    (country ? "Страна: " + esc(country) + "\n" : "") +
    (ua ? "Устройство: " + esc(ua) : "");

  const chatId = env.ADMIN_CHAT_ID || env.CHAT_ID;
  if (chatId) {
    await tg(env, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  }
  return json({ ok: true }, 200, cors);
}



// Продукт по адресу страницы. ОДНО правило на две стороны: так же его считает
// маячок в metrika.js — иначе открытия и заявки лягут под разными ключами
// и в таблице кабинета не сойдутся в одну строку.
//   instrument.html?id=X -> X      offerings.html#X -> X
//   p/X.html             -> X      прочее           -> имя страницы
function productFromUrl(u) {
  let path = "", query = "", hash = "";
  try {
    const url = new URL(String(u || ""), SHELL_BASE);
    path = url.pathname; query = url.search; hash = url.hash;
  } catch (e) { return ""; }
  const byId = query.match(/[?&]id=([\w.-]{1,60})/);
  if (byId) return byId[1];
  const shell = path.match(/\/p\/([\w.-]{1,60})\.html$/);
  if (shell) return shell[1];
  if (/offerings\.html$/.test(path) && hash.length > 1) return hash.slice(1).slice(0, 60);
  const page = (path.split("/").pop() || "").replace(/\.html$/, "");
  return page || "index";
}

// ============================ КАБИНЕТ АГЕНТА ================================
// Зачем: у агента не было СВОИХ цифр. Метка ?ref= уходила в Метрику, которую он
// не видит, — то есть работа по персональным ссылкам была для него слепой.
// Кабинет показывает: сколько раз открывали его ссылки, какие продукты смотрели,
// какие заявки пришли. Это единственная причина заходить на витрину ежедневно,
// не связанная с нашим контентом.
//
// Что храним: МЕТКА + ПРОДУКТ + ВРЕМЯ. Ни IP, ни user-agent, ни чего-либо, по чему
// можно узнать конкретного человека, — открытие ссылки не должно превращаться
// в слежку за клиентом. Агент видит «ссылку открыли», а не «кто открыл».
//
// Как храним: ключ на событие, полезная нагрузка в metadata. Тогда весь период
// читается ОДНИМ list() — без отдельного get на каждое событие. Счётчик одним
// ключом не годится: KV разрешает запись в ключ примерно раз в секунду, и
// одновременные открытия затирали бы друг друга.
const HIT_TTL = 90 * 24 * 3600;   // события живут 90 дней, дальше KV чистит сам
const HIT_PAGES = 12;             // потолок страниц list() за один запрос статистики
// Типы события. «Открытие» — первый заход по ссылке за визит, это и есть ответ на
// вопрос «сколько раз открывали мою ссылку». «Просмотр» — следующий продукт, который
// человек посмотрел в том же визите: считать его вторым открытием было бы враньём,
// а выбрасывать жалко — именно он говорит, чем клиент заинтересовался.
const HIT_KINDS = new Set(["open", "view", "lead"]);

// ДВА РАЗНЫХ СЕКРЕТА, и это важно:
//   SALES_KEYS   — свои сейлзы. Открывает АДМИНКУ (подача продуктов на модерацию).
//   PARTNER_KEYS — внешние партнёры. Открывает ТОЛЬКО рабочий стол, не админку.
// Формат обоих одинаков: "andrey:ключ1,polina:ключ2"; имя = метка ?ref=.
// Зачем разделять: партнёр с ключом от админки мог бы подавать продукты и (с
// 26.08.2026 сделки пишутся из админки напрямую) вписывать себе вознаграждение.
// Ключ партнёра открывает ТОЛЬКО стол — /submit отвечает ему 403 (есть тест).
function keyPairs(raw) {
  const out = [];
  for (const pair of String(raw || "").split(",")) {
    const i = pair.indexOf(":");
    if (i > 0) out.push([pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim()]);
  }
  return out;
}

// Метки, которые мы вообще знаем: по ним копятся открытия ссылок.
function knownRefs(env) {
  return keyPairs(env.PARTNER_KEYS).concat(keyPairs(env.SALES_KEYS)).map(function (x) { return x[0]; });
}
function salesNames(env) { return knownRefs(env); }

// Реестр партнёров: метка существует, если у неё есть реквизиты (pinfo:<метка>
// в KV — заводятся заявкой из админки или командой /partner) ИЛИ ключ входа в
// PARTNER_KEYS. Ключи — только про вход на стол; сделки, подборка и чат от них
// не зависят. Раньше реестром были одни ключи, и партнёр «появлялся» лишь после
// ручной правки секрета в Cloudflare — теперь его заводит сейлз через админку.
// Кэш реестра в изоляте нужен ровно одному месту — recordHit, который зовётся на
// КАЖДОЕ открытие ссылки. Пути админки и бота ходят с fresh=true: сброс кэша
// (pinfoInvalidate) работает только в СВОЁМ изоляте, а вебхук ✅ и запрос сейлза
// почти всегда попадают в разные — без fresh сейлз до 30 с получал бы «партнёра
// нет в списке» сразу после одобрения.
let PREFS = { at: 0, refs: [] };
function pinfoInvalidate() { PREFS = { at: 0, refs: [] }; }

async function partnerRefs(env, fresh) {
  const now = Date.now();
  if (!fresh && PREFS.at && now - PREFS.at < 30000) return PREFS.refs;
  const set = new Set(keyPairs(env.PARTNER_KEYS).map(function (x) { return x[0]; }));
  if (env.POST_KV) {
    try {
      let cursor = null;
      do {
        const r = await env.POST_KV.list({ prefix: "pinfo:", limit: 1000, cursor: cursor || undefined });
        for (const k of r.keys) set.add(k.name.slice(6));
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
    } catch (e) { return [...set]; }   // сбой чтения не кэшируем
  }
  PREFS = { at: now, refs: [...set] };
  return PREFS.refs;
}

// ---------- КЛЮЧИ ВХОДА В РАБОЧИЙ СТОЛ ----------
// Раньше пара «метка:ключ» жила ТОЛЬКО в секрете PARTNER_KEYS, и завести партнёра
// без похода Руслана в Cloudflare было нельзя. Теперь ключ выдаётся сам при ✅ и
// показывается ОДИН раз: Руслану в карточке, сейлзу в админке.
// Хранение — ОДНА запись `pkey:<метка>`: хэш живёт вечно, а сам ключ лежит рядом
// в поле `show` только до забора (и не дольше KEY_SHOW_TTL). Двумя записями
// (хэш отдельно, ключ отдельно) двойное ✅ могло записать хэш от одного ключа, а
// показать другой — партнёр получал бы «ключ не подошёл» без всякой диагностики.
// Срок показа продублирован в metadata: список партнёров тогда собирается одним
// list, без чтения значений (а значит и без открытых ключей в памяти воркера).
// Старый секрет PARTNER_KEYS остаётся рабочим: deskLogin проверяет оба источника.
const KEY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";   // без похожих 0/o/1/l/i
const KEY_SHOW_TTL = 172800;      // 2 суток на забрать: дальше проще перевыпустить
const KEY_REPEAT_TTL = 900;       // 15 минут на повтор, если ответ не доехал
// Формат ключа — чтобы отсеивать мусор ДО похода в KV (вход открыт всему интернету)
const KEY_SHAPE = /^[a-hj-km-np-z2-9]{5}(-[a-hj-km-np-z2-9]{5}){3}$/;
const REF_SHAPE = /^[a-z0-9][a-z0-9._-]{0,39}$/;

function makeDeskKey() {
  const out = [];
  // Отбрасываем хвост диапазона: иначе первые буквы алфавита выпадали бы чаще.
  const limit = 256 - (256 % KEY_ALPHABET.length);
  while (out.length < 20) {
    const b = new Uint8Array(24);
    crypto.getRandomValues(b);
    for (const x of b) {
      if (x >= limit || out.length >= 20) continue;
      out.push(KEY_ALPHABET[x % KEY_ALPHABET.length]);
    }
  }
  return out.join("").replace(/(.{5})(?=.)/g, "$1-");     // xxxxx-xxxxx-xxxxx-xxxxx
}

async function keyHash(ref, key) {
  const data = new TextEncoder().encode("rumberg:" + ref + ":" + key);
  const h = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(h)].map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}
// Сравнение хэшей за постоянное время — привычка, а не паранойя: обычный === на
// секрете подсказывает длину общего префикса.
function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Выдать (или перевыпустить) ключ. Одна запись: хэш + сам ключ до забора.
// Перевыпуск затирает прежний хэш, то есть старый ключ перестаёт пускать (в KV
// чтение может отдавать прежнее значение ещё до минуты — это не «мгновенно»).
async function issueDeskKey(env, ref, by) {
  const key = makeDeskKey();
  const until = Date.now() + KEY_SHOW_TTL * 1000;
  await env.POST_KV.put("pkey:" + ref, JSON.stringify({
    h: await keyHash(ref, key), ts: Date.now(), by: by || "", show: key, until: until,
  }), { metadata: { until: until } });
  return key;
}

// Забрать выданный ключ. Первый показ не стирает его сразу, а сокращает срок до
// KEY_REPEAT_TTL: оборвись ответ на пути к браузеру — ключ был бы потерян совсем
// (в KV только хэш), и сейлзу пришлось бы просить перевыпуск, не понимая почему.
async function takeDeskKey(env, ref, by) {
  const rec = await env.POST_KV.get("pkey:" + ref, "json");
  if (!rec) return { error: "no_key" };
  if (!rec.show || !rec.until || rec.until < Date.now()) return { error: "key_gone" };
  const first = !rec.by_shown;
  const until = Math.min(rec.until, Date.now() + KEY_REPEAT_TTL * 1000);
  try {
    await env.POST_KV.put("pkey:" + ref, JSON.stringify({
      h: rec.h, ts: rec.ts, by: rec.by, show: rec.show, until: until, by_shown: by || rec.by_shown || "?",
    }), { metadata: { until: until, taken: true } });   // taken — для сводного кабинета
  } catch (e) { /* пометку не записали — ключ всё равно отдаём */ }
  return { key: rec.show, first: first };
}

// Вход в рабочий стол: партнёры И свои сейлзы. Возвращает {ref, kind} или null.
// ТРИ источника: секреты PARTNER_KEYS и SALES_KEYS (заводит Руслан руками) плюс
// ключи, выданные конвейером админки, — от них в KV лежит только хэш.
// Асинхронный: за хэшем надо сходить в KV. Зовётся из /stats, /picks и /chat.
async function deskLogin(env, id, key) {
  const wantId = String(id || "").trim().toLowerCase();
  const wantKey = String(key || "").trim();
  if (!wantId || !wantKey) return null;
  for (const pair of keyPairs(env.PARTNER_KEYS)) {
    if (pair[0] === wantId && pair[1] === wantKey) return { ref: pair[0], kind: "partner" };
  }
  for (const pair of keyPairs(env.SALES_KEYS)) {
    if (pair[0] === wantId && pair[1] === wantKey) return { ref: pair[0], kind: "sales" };
  }
  // Дальше — ключи, выданные конвейером. Вход открыт всему интернету, поэтому
  // мусор отсекаем по форме ДО чтения KV, а не платим за него хранилищем.
  if (env.POST_KV && REF_SHAPE.test(wantId) && KEY_SHAPE.test(wantKey)) {
    try {
      const rec = await env.POST_KV.get("pkey:" + wantId, "json");
      if (rec && rec.h && safeEq(rec.h, await keyHash(wantId, wantKey))) {
        // Метка обязана быть в реестре: иначе ключ, выданный партнёру, которого
        // потом убрали из PARTNER_KEYS (а /partnerrm никто не звал — реквизитов
        // у метки не было), пускал бы бывшего контрагента на стол вечно.
        if ((await partnerRefs(env)).includes(wantId)) return { ref: wantId, kind: "partner" };
      }
    } catch (e) { /* сбой хранилища — просто не пускаем */ }
  }
  return null;
}

// ---------- СВОДНЫЙ КАБИНЕТ ВЛАДЕЛЬЦА ----------
// Отдельный вход, не связанный с SALES_KEYS: сводка по ВСЕМ агентам — это книга
// вознаграждений целиком, её видит только Руслан. Ключ выдаётся командой
// /bosskey, в KV лежит его хэш (та же схема, что у ключей стола); запасной
// вариант — переменная BOSS_KEY, если однажды захочется задать ключ руками.
// Возвращает true / false / "storage": сбой хранилища НЕ должен выглядеть как
// «ключ не подошёл» — страница по такому ответу стирала сохранённый ключ, и
// пропажа биндинга KV уводила диагностику ровно в другую сторону.
async function bossLogin(env, key) {
  const want = String(key || "").trim();
  if (!want) return false;
  // Запасной ключ из переменной: короткое слово защитой не считаем.
  if (env.BOSS_KEY && String(env.BOSS_KEY).trim().length >= 12 &&
      safeEq(String(env.BOSS_KEY).trim(), want)) return true;
  // Без хранилища проверить выданный ключ нельзя — но если задан BOSS_KEY, то
  // проверка состоялась и просто не совпала: это «не подошёл», а не сбой.
  if (!env.POST_KV) return env.BOSS_KEY ? false : "storage";
  if (!KEY_SHAPE.test(want)) return false;
  try {
    const rec = await env.POST_KV.get("bkey:main", "json");
    return !!(rec && rec.h && safeEq(rec.h, await keyHash("boss", want)));
  } catch (e) { return "storage"; }
}

// События открытий/просмотров/заявок. prefix — "hit:" (все агенты) или
// "hit:<метка>:" (один). Читаем метаданные ключей: значения пустые, см. recordHit.
async function hitEvents(env, prefix) {
  const out = [];
  let cursor = null, pages = 0, truncated = false;
  do {
    const r = await env.POST_KV.list({ prefix: prefix, limit: 1000, cursor: cursor || undefined });
    for (const k of r.keys) {
      if (!k.metadata || !k.metadata.ts) continue;
      // Метка события — между "hit:" и меткой времени: hit:<ref>:<ts>-<rnd>
      const rest = k.name.slice(4);
      const i = rest.indexOf(":");
      out.push({ ref: i > 0 ? rest.slice(0, i) : "", m: k.metadata });
    }
    cursor = r.list_complete ? null : r.cursor;
    if (cursor && ++pages >= HIT_PAGES) { truncated = true; cursor = null; }
  } while (cursor);
  return { events: out, truncated: truncated };
}

// Сводка активности по одной метке из уже прочитанных событий.
// light=true — только счётчики: сводке products и days не нужны, а считать их
// на каждого агента значит сортировать десятки списков впустую.
function hitSummary(events, now, light) {
  const D = 86400000, byProd = new Map(), byDay = new Map();
  let opens = 0, opens7 = 0, opens30 = 0, views = 0, leads = 0, leads30 = 0, last = 0;
  for (const e of events) {
    const age = now - e.ts;
    if (e.ts > last) last = e.ts;
    if (e.t === "lead") { leads++; if (age <= 30 * D) leads30++; }
    else if (e.t === "view") { views++; }
    else { opens++; if (age <= 7 * D) opens7++; if (age <= 30 * D) opens30++; }
    const id = e.p || "—";
    const row = byProd.get(id) || { p: id, opens: 0, views: 0, leads: 0, last: 0 };
    if (e.t === "lead") row.leads++; else if (e.t === "view") row.views++; else row.opens++;
    if (e.ts > row.last) row.last = e.ts;
    if (light) continue;
    byProd.set(id, row);
    if (e.t !== "lead" && e.t !== "view" && age <= 30 * D) {
      const k = mskDay(e.ts);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }
  }
  return {
    opens: { all: opens, d7: opens7, d30: opens30 },
    views: { all: views }, leads: { all: leads, d30: leads30 }, last: last,
    // Сортируем по ОТКРЫТИЯМ — ровно по тому числу, что печатает страница:
    // иначе продукт с нулём открытий вставал бы выше продукта с тремя.
    products: [...byProd.values()].sort(function (a, b) {
      return (b.opens - a.opens) || (b.views + b.leads) - (a.views + a.leads);
    }).slice(0, 60),
    days: [...byDay.entries()].map(function (x) { return { d: x[0], n: x[1] }; })
      .sort(function (a, b) { return a.d < b.d ? -1 : 1; }),
  };
}

async function handleBoss(request, env, cors) {
  let d;
  try { d = await request.json(); } catch (e) { return json({ ok: false, error: "bad_json" }, 400, cors); }
  const who = await bossLogin(env, d.key);
  if (who === "storage") return json({ ok: false, error: "no_storage" }, 503, cors);
  if (!who) return json({ ok: false, error: "bad_key" }, 403, cors);
  const now = Date.now();

  // Состояние входа у каждой метки — одним list по metadata (как в action partners).
  // Состояние входа: три разных, а не два. «Ключ ждёт» (выдан, не забрали),
  // «забран» (у партнёра на руках) и «протух» — по последнему нужен перевыпуск,
  // и зелёное «вход выдан» на нём было бы обманом: войти уже нельзя.
  const hasKey = new Set(keyPairs(env.PARTNER_KEYS).map(function (x) { return x[0]; }));
  const keyState = {};
  for (const r0 of hasKey) keyState[r0] = "secret";
  try {
    let cursor = null;
    do {
      const k = await env.POST_KV.list({ prefix: "pkey:", limit: 1000, cursor: cursor || undefined });
      for (const x of k.keys) {
        const r2 = x.name.slice(5), md = x.metadata || {};
        hasKey.add(r2);
        keyState[r2] = md.taken ? "taken" : (md.until && md.until > now) ? "ready" : "expired";
      }
      cursor = k.list_complete ? null : k.cursor;
    } while (cursor);
  } catch (e) { /* флаги необязательны */ }

  const refs = await partnerRefs(env, true);

  // Разбор одного агента: то же, что видит он сам на столе, плюс активность.
  const one = cleanStr(d.ref, 40).toLowerCase();
  if (one) {
    if (!refs.includes(one)) return json({ ok: false, error: "bad_ref" }, 422, cors);
    let ev = { events: [], truncated: false };
    try { ev = await hitEvents(env, "hit:" + one + ":"); }
    catch (e) { return json({ ok: false, error: "storage_failed" }, 502, cors); }
    const deals = (await dealsGet(env, one)).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0);
    });
    return json({
      ok: true, now: now, ref: one, profile: await pinfoGet(env, one),
      deals: deals, totals: dealTotals(deals),
      hasKey: hasKey.has(one), keyState: keyState[one] || null,
      ...hitSummary(ev.events.map(function (x) { return x.m; }), now),
      truncated: ev.truncated,
    }, 200, cors);
  }

  // Сводка: события всех агентов читаем ОДНИМ проходом по префиксу, а не по
  // списку на каждого — иначе десяток агентов стоил бы десятка обходов хранилища.
  let all = { events: [], truncated: false };
  try { all = await hitEvents(env, "hit:"); } catch (e) { /* активность необязательна */ }
  const byRef = new Map();
  for (const e of all.events) {
    if (!byRef.has(e.ref)) byRef.set(e.ref, []);
    byRef.get(e.ref).push(e.m);
  }

  // Метки СВОИХ сейлзов тоже в списке: recordHit копит открытия и по ним, а по
  // их ссылкам идёт основная масса трафика — без них плитка «по всем агентам»
  // недосчитывала бы ровно то, что сейчас есть. Отличаются полем kind.
  const sales = new Set(keyPairs(env.SALES_KEYS).map(function (x) { return x[0]; }));
  const everyone = [...new Set(refs.concat([...sales]))];

  // Чтения пачками: последовательный цикл на сотне агентов — это сотни ожиданий
  // подряд и секунды задержки.
  const partners = [];
  for (let i = 0; i < everyone.length; i += 15) {
    const chunk = everyone.slice(i, i + 15);
    const got = await Promise.all(chunk.map(async function (ref) {
      const deals = await dealsGet(env, ref);
      const info = await pinfoGet(env, ref);
      return { ref: ref, deals: deals, info: info };
    }));
    for (const g of got) {
      const tt = dealTotals(g.deals);
      const t = tt.RUB || { accrued: 0, paid: 0, volume: 0, count: 0 };
      // Валюты не складываем (правило витрины): считаем рублёвые, а о прочих
      // честно сообщаем флагом, иначе «сделок 3 · объём 0 ₽» выглядело бы сбоем.
      const other = Object.keys(tt).filter(function (c) { return c !== "RUB"; });
      let lastDeal = "";
      for (const x of g.deals) if (x.date > lastDeal) lastDeal = x.date;
      const h = hitSummary(byRef.get(g.ref) || [], now, true);
      partners.push({
        ref: g.ref, name: (g.info && g.info.name) || "", profile: g.info || null,
        kind: sales.has(g.ref) && !refs.includes(g.ref) ? "sales" : "partner",
        count: t.count, otherCcy: other.length ? other : null,
        volume: t.volume, reward: t.accrued + t.paid, lastDeal: lastDeal,
        opens: h.opens, leads: h.leads, lastHit: h.last,
        hasKey: hasKey.has(g.ref), keyState: keyState[g.ref] || null,
      });
    }
  }
  partners.sort(function (a, b) { return b.reward - a.reward; });
  return json({ ok: true, now: now, partners: partners, truncated: all.truncated }, 200, cors);
}

// ---------- СДЕЛКИ ПАРТНЁРА ----------
// Правды про «чья сделка» в бэк-офисе НЕТ: поле partner там есть только у сделок
// с облигациями, это свободная строка до 255 знаков, а у автоколлов и защиты
// капитала его нет вовсе (проверено по схеме API 20.08.2026, 567 маршрутов).
// Полей вознаграждения нет ни у чего. Поэтому сделки заводятся РУКАМИ: командой
// боту от ADMIN_CHAT_ID или (с 26.08.2026) сейлзом из админки — там запись идёт
// сразу, без одобрения, Руслану уходит отбивка.
//
// Хранение: ОДИН ключ на партнёра со списком сделок (deals:<метка>). Сделки по
// одному партнёру заводит один человек, а стол читает список одним get. TTL НЕ
// ставим: это учётные данные, они не должны исчезать сами.
const DEAL_STATUS = { accrued: "начислено", paid: "выплачено" };
const DEAL_CCY = ["RUB", "USD", "EUR", "CNY"];
const DEAL_SIGN = { RUB: " ₽", USD: " $", EUR: " €", CNY: " ¥" };

async function dealsGet(env, ref) {
  if (!env.POST_KV) return [];
  try { return (await env.POST_KV.get("deals:" + ref, "json")) || []; } catch (e) { return []; }
}
async function dealsPut(env, ref, list) {
  await env.POST_KV.put("deals:" + ref, JSON.stringify(list));
}

// ---------- РЕКВИЗИТЫ ПАРТНЁРА ----------
// Название, ИНН, ОГРН/ОГРНИП и номер договора живут в KV (pinfo:<метка>), а НЕ в
// репозитории: репозиторий ПУБЛИЧНЫЙ, и список партнёров с их реквизитами в него
// попадать не должен. Заводит их Руслан командой /partner, стол читает через /stats.
const PINFO_FIELDS = ["name", "inn", "ogrn", "ogrnip", "contract", "status"];

async function pinfoGet(env, ref) {
  if (!env.POST_KV) return null;
  try { return (await env.POST_KV.get("pinfo:" + ref, "json")) || null; } catch (e) { return null; }
}

// Разбор строки /partner. Поля узнаём ПО СОДЕРЖИМОМУ, как в /deal: порядок
// запоминать не надо. ИНН — 10 цифр (юрлицо) или 12 (ИП), ОГРН — 13, ОГРНИП — 15.
function pinfoParse(env, line, extraRefs) {
  const parts = String(line || "").split("|").map(function (x) { return x.trim(); })
    .filter(function (x) { return x !== ""; });
  if (parts.length < 2) return { error: "нужны метка и хотя бы название" };
  const ref = parts.shift().toLowerCase();
  // extraRefs — партнёры, заведённые через админку (pinfo без ключа): /partner
  // должен уметь править их реквизиты, а не отвечать «нет в списке».
  const known = knownRefs(env).concat(extraRefs || []);
  if (!known.includes(ref)) {
    return { error: "партнёра «" + ref + "» нет в списке. Известные: " +
                    (known.join(", ") || "ни одного") };
  }
  const info = {};
  for (const raw of parts) {
    const x = raw.replace(/^(ИНН|ОГРНИП|ОГРН|договор|статус)\s*[:№]?\s*/i, "").trim();
    const digits = x.replace(/\D/g, "");
    if (/^ИНН/i.test(raw) || (digits.length === 10 || digits.length === 12) && digits === x) {
      info.inn = digits; continue;
    }
    if (/^ОГРНИП/i.test(raw) || (digits.length === 15 && digits === x)) { info.ogrnip = digits; continue; }
    if (/^ОГРН/i.test(raw) || (digits.length === 13 && digits === x)) { info.ogrn = digits; continue; }
    if (/^договор/i.test(raw)) { info.contract = x.slice(0, 60); continue; }
    if (/^статус/i.test(raw)) { info.status = x.slice(0, 40); continue; }
    if (!info.name) info.name = raw.slice(0, 120);
  }
  if (!info.name) return { error: "не понял, где название партнёра" };
  if (info.inn && info.inn.length !== 10 && info.inn.length !== 12) {
    return { error: "ИНН «" + info.inn + "» не 10 и не 12 цифр" };
  }
  if (info.ogrn && info.ogrn.length !== 13) return { error: "ОГРН должен быть 13 цифр" };
  if (info.ogrnip && info.ogrnip.length !== 15) return { error: "ОГРНИП должен быть 15 цифр" };
  return { ref: ref, info: info };
}

function pinfoText(ref, info) {
  const rows = [
    ["Название", info.name],
    ["ИНН", info.inn],
    ["ОГРН", info.ogrn],
    ["ОГРНИП", info.ogrnip],
    ["Договор", info.contract],
    ["Статус", info.status],
  ].filter(function (r) { return r[1]; });
  return "<b>" + esc(ref) + "</b>\n" + rows.map(function (r) {
    return r[0] + ": <code>" + esc(String(r[1])) + "</code>";
  }).join("\n");
}

// Число из человеческой записи: «5 000 000», «5000000», «112 500,50».
function dealNum(v) {
  const t = String(v || "").replace(/[\s _]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

// Дата ДД.ММ.ГГГГ или ГГГГ-ММ-ДД -> ISO. Иначе null.
function dealDate(v) {
  const t = String(v || "").trim();
  let m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    const mm = Number(m[2]), dd = Number(m[1]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return m[3] + "-" + m[2] + "-" + m[1];
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mm2 = Number(m[2]), dd2 = Number(m[3]);
  if (mm2 < 1 || mm2 > 12 || dd2 < 1 || dd2 > 31) return null;
  return t;
}

// Разбор строки команды /deal. Статус и валюту узнаём ПО СОДЕРЖИМОМУ, а не по месту:
// иначе порядок полей приходилось бы помнить наизусть.
function dealParse(env, line, extraRefs) {
  const parts = String(line || "").split("|").map(function (x) { return x.trim(); })
    .filter(function (x) { return x !== ""; });
  if (parts.length < 5) return { error: "мало полей" };
  const refRaw = parts.shift().toLowerCase();
  // extraRefs — партнёры, заведённые через админку (pinfo без ключа входа).
  const known = knownRefs(env).concat(extraRefs || []);
  if (!known.includes(refRaw)) {
    return { error: "партнёра «" + refRaw + "» нет в списке. Известные: " +
                    (known.join(", ") || "ни одного") };
  }
  let status = "accrued", ccy = "RUB", isin = "";
  const rest = [];
  for (const x of parts) {
    const low = x.toLowerCase();
    if (low === "выплачено" || low === "paid") { status = "paid"; continue; }
    if (low === "начислено" || low === "accrued") { status = "accrued"; continue; }
    if (DEAL_CCY.includes(x.toUpperCase())) { ccy = x.toUpperCase(); continue; }
    // ISIN — по виду. Он связывает сделку с выпуском на странице «Мои выпуски»:
    // без него агент видит сделку, но не видит, что с бумагой происходит.
    if (/^RU[0-9A-Z]{10}$/i.test(x)) { isin = x.toUpperCase(); continue; }
    rest.push(x);
  }
  if (rest.length < 4) return { error: "нужны продукт, дата, объём и вознаграждение" };
  const prod = rest[0], dateRaw = rest[1], volRaw = rest[2], rwRaw = rest[3];
  const date = dealDate(dateRaw);
  if (!date) return { error: "дата «" + dateRaw + "» непонятна, нужна ДД.ММ.ГГГГ" };
  const volume = dealNum(volRaw);
  if (volume === null || volume <= 0) return { error: "объём «" + volRaw + "» не число" };
  const reward = dealNum(rwRaw);
  if (reward === null || reward < 0) return { error: "вознаграждение «" + rwRaw + "» не число" };
  // Вознаграждение больше объёма — почти наверняка опечатка в разряде.
  if (reward > volume) return { error: "вознаграждение больше объёма сделки — похоже на опечатку" };
  return {
    ref: refRaw,
    deal: {
      id: Math.random().toString(36).slice(2, 8),
      product: prod.slice(0, 80), isin: isin, date: date, volume: volume, reward: reward,
      currency: ccy, status: status, ts: Date.now(),
    },
  };
}

function dealMoney(n, ccy) {
  const sign = DEAL_SIGN[ccy] || (" " + ccy);
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + sign;
}

function dealLine(d) {
  const dmy = d.date.split("-").reverse().join(".");
  return "<code>" + esc(d.id) + "</code>  " + esc(dmy) + "  " + esc(d.product) +
         "\n     объём " + dealMoney(d.volume, d.currency) +
         " · вознаграждение <b>" + dealMoney(d.reward, d.currency) + "</b> · " +
         DEAL_STATUS[d.status];
}

// Итоги по валютам — складывать рубли с долларами нельзя.
function dealTotals(list) {
  const t = {};
  for (const d of list) {
    const c = d.currency || "RUB";
    const row = t[c] || (t[c] = { accrued: 0, paid: 0, volume: 0, count: 0 });
    row.count++;
    row.volume += d.volume || 0;
    if (d.status === "paid") row.paid += d.reward || 0; else row.accrued += d.reward || 0;
  }
  return t;
}

// Строка итогов для сообщений бота.
function dealTotalsText(t) {
  return Object.keys(t).map(function (c) {
    return "Итого " + c + ": начислено <b>" + dealMoney(t[c].accrued, c) +
           "</b>, выплачено <b>" + dealMoney(t[c].paid, c) + "</b>";
  }).join("\n");
}

// Дата события по Москве — чтобы «сегодня» в кабинете совпадало с «сегодня» агента.
function mskDay(ts) {
  const d = new Date(ts + 3 * 3600 * 1000);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") +
         "-" + String(d.getUTCDate()).padStart(2, "0");
}

// Записать событие. Метки, которых нет в SALES_KEYS (напр. маркетинговые utm),
// НЕ копим: иначе любой желающий надует нам хранилище через открытый эндпоинт.
async function recordHit(env, ref, product, kind) {
  if (!env.POST_KV || !ref) return false;
  // Партнёр, заведённый через админку, живёт в KV, а не в секрете — без реестра
  // его ссылки не считались бы вовсе (список кэшируется на 30 с, см. partnerRefs).
  if (!salesNames(env).includes(ref) && !(await partnerRefs(env)).includes(ref)) return false;
  const ts = Date.now();
  const key = "hit:" + ref + ":" + ts + "-" + Math.random().toString(36).slice(2, 8);
  try {
    await env.POST_KV.put(key, "", {
      expirationTtl: HIT_TTL,
      metadata: { p: String(product || "").slice(0, 80), t: HIT_KINDS.has(kind) ? kind : "open", ts },
    });
    return true;
  } catch (e) { return false; }
}

// --- Открытие персональной ссылки (маячок с сайта) ---
// Отвечаем ok всегда, даже если метка чужая: браузер не должен уметь выяснять
// через этот эндпоинт, какие метки у нас заведены.
async function handleHit(request, env, cors) {
  const origin = request.headers.get("Origin");
  if (env.ALLOW_ORIGIN && env.ALLOW_ORIGIN !== "*" && origin && origin !== env.ALLOW_ORIGIN) {
    return json({ ok: false, error: "forbidden_origin" }, 403, cors);
  }
  let d = {};
  try { d = await request.json(); } catch (e) {}
  const ref = String(d.ref || "").trim().toLowerCase().slice(0, 60);
  const prod = String(d.p || "").trim().slice(0, 80);
  const kind = d.t === "view" ? "view" : "open";
  await recordHit(env, ref, prod, kind);
  return json({ ok: true }, 200, cors);
}

// --- Статистика агента ---
// ---------- ПОДБОРКА ПРОДУКТОВ ПОД КОНКРЕТНОГО АГЕНТА ----------
// Модель читает новости дня и книгу агента (что он уже продаёт) и подбирает
// продукты с доски именно под него. Считается РАЗ В ДЕНЬ на агента и лежит в KV:
// иначе каждый заход на стол стоил бы вызова LLM.
//
// ЧТО УХОДИТ В МОДЕЛЬ: типы продуктов агента и базовые активы. Объёмы,
// вознаграждение, ISIN, название партнёра и его реквизиты НЕ отправляются —
// DeepSeek работает на серверах в Китае, и коммерческие условия партнёра туда
// попадать не должны. Для персонализации хватает «что он продаёт».
const PICKS_N = 4;
const PICKS_TTL = 3 * 86400;
// Границу слова задаём через \p{L} с флагом u: в JS \b и \w — про латиницу,
// и с кириллицей запрет молча не срабатывал («Гарантированный» проходил насквозь).
const PICKS_BAN = /(?<!\p{L})(нот[аыуе]|гарантирован|доходност|прибыл)\p{L}*/iu;

// Книга агента одной строкой на выпуск: тип выплаты + активы, без денег.
function picksBook(deals, issues) {
  const byIsin = {};
  for (const i of issues || []) if (i.isin) byIsin[i.isin] = i;
  const seen = {}, lines = [];
  for (const d of deals || []) {
    const it = d.isin && byIsin[d.isin];
    const kind = it ? (it.kind === "participation" ? "участие в росте" : "купонный") : null;
    const assets = it ? (it.basket || []).map((b) => b.n || b.t).filter(Boolean).join(", ") : "";
    const key = (kind || "") + "|" + assets;
    if (!kind || seen[key]) continue;
    seen[key] = 1;
    lines.push("- " + kind + (assets ? " · актив: " + assets : ""));
  }
  return lines;
}

// Выпуски партнёра для промпта ассистента (режим партнёра на рабочем столе).
// В модель уходят ТОЛЬКО публичные параметры из data/placements.js: название,
// ISIN, тип, активы, купон/участие, Bid. Объёмы, вознаграждение, название
// партнёра и его реквизиты НЕ отправляются — то же правило, что у /picks
// (DeepSeek — серверы в Китае, коммерческие условия туда не попадают).
// Сделки БЕЗ матча по ISIN в данных витрины ПРОПУСКАЮТСЯ ЦЕЛИКОМ (прецедент
// picksBook): d.product — свободная строка админа из /deal, в ней может
// оказаться что угодно, вплоть до сумм. Каталог упал (issues пуст) — книги нет
// вовсе; про это состояние handleChat говорит модели отдельной честной фразой.
function partnerChatContext(deals, issues) {
  const byIsin = {};
  for (const i of issues || []) if (i.isin) byIsin[i.isin] = i;
  const today = mskDate().key, seen = {}, lines = [];
  for (const d of deals || []) {
    const it = d.isin && byIsin[d.isin];
    if (!it || seen[d.isin]) continue;
    seen[d.isin] = 1;
    const kind = it.kind === "participation" ? "участие в росте" : "купонный";
    const assets = (it.basket || []).map((b) => b.n || b.t).filter(Boolean).join(", ");
    const pay = it.kind === "participation"
      ? (it.payoff && it.payoff.participationPct != null && "участие " + it.payoff.participationPct + "%")
      : (it.payoff && it.payoff.couponPa != null && "купон " + it.payoff.couponPa + "% годовых");
    // Bid — только у обращающихся (правило витрины); погашенный так и называем.
    const matured = it.maturity && it.maturity < today;
    const quote = matured ? "выпуск уже погашен"
      : (it.bid != null ? "Bid " + it.bid + "% (индикативно)" : "котировки Bid сейчас нет");
    lines.push("- " + [it.serial || it.name, "ISIN " + d.isin, kind,
      assets && "актив: " + assets, pay, quote].filter(Boolean).join(" · "));
    if (lines.length >= 20) break;
  }
  return lines.join("\n");
}

// Код-подбор на случай, когда модели нет или её ответ не прошёл проверку:
// по одному продукту на тип, потом добор по разным активам. Та же логика, что
// на странице, — стол не остаётся пустым никогда.
function picksFallback(instr, n) {
  const out = [], seenType = {}, seenAsset = {};
  const take = (p) => {
    const a = String(p.underlying || p.id).toLowerCase();
    if (seenAsset[a]) return;
    seenAsset[a] = 1; seenType[p.type] = 1; out.push(p);
  };
  for (const p of instr) { if (out.length >= n) break; if (!seenType[p.type]) take(p); }
  for (const p of instr) { if (out.length >= n) break; take(p); }
  return out.map((p) => ({ id: p.id, why: "" }));
}

// Проверка ответа модели. Пропускаем только то, что можно доказать каталогом.
function picksLint(list, instr) {
  const byId = {};
  for (const p of instr) byId[p.id] = p;
  const out = [], problems = [];
  const seenId = {}, seenAsset = {}, typeCount = {};
  // Длинные названия вперёд: иначе «ОФЗ» вычеркнется раньше, чем «ОФЗ 26238»,
  // и в строке останется голое число, которое мы примем за выдумку модели.
  const assetNames = instr.map((x) => String(x.underlying || "")).filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String((raw && raw.id) || "").trim();
    const p = byId[id];
    if (!p) { problems.push("id «" + id + "» не из каталога"); continue; }
    if (seenId[id]) { problems.push("повтор " + id); continue; }
    const asset = String(p.underlying || p.id).toLowerCase();
    if (seenAsset[asset]) { problems.push("второй продукт на актив " + p.underlying); continue; }
    typeCount[p.type] = (typeCount[p.type] || 0) + 1;
    if (typeCount[p.type] > 2) { problems.push("третий продукт типа " + p.type); continue; }
    let why = String((raw && raw.why) || "").trim().replace(/\s+/g, " ");
    // Цифры в подписи запрещены: проценты и цены страница печатает сама из данных,
    // а выдуманное моделью число выглядело бы так же убедительно, как настоящее.
    // Но в названиях активов цифры законны («S&P 500», «ОФЗ 26238»), поэтому
    // сначала вычёркиваем известные активы и только потом ищем цифры.
    let bare = why;
    for (const a of assetNames) bare = bare.split(a).join(" ");
    if (/\d/.test(bare)) { problems.push("цифры в подписи к " + id); why = ""; }
    if (PICKS_BAN.test(why)) { problems.push("запрещённое слово в подписи к " + id); why = ""; }
    if (why.length > 120) { problems.push("длинная подпись у " + id); why = why.slice(0, 117) + "…"; }
    seenId[id] = 1; seenAsset[asset] = 1;
    out.push({ id: id, why: why });
    if (out.length >= PICKS_N) break;
  }
  return { picks: out, problems: problems };
}

const PICKS_SYSTEM = `Ты подбираешь продукты для конкретного агента по продажам структурных продуктов Rumberg (клиенты — квалифицированные инвесторы).

Тебе дают: новости дня (если есть), книгу агента (что он уже продаёт) и каталог продуктов, доступных сегодня.

Верни СТРОГИЙ JSON: {"picks":[{"id":"<id из каталога>","why":"<одна фраза>"}]}
Ровно ${PICKS_N} позиции, ничего кроме JSON.

Правила:
- id берёшь ТОЛЬКО из блока «ТЕКУЩИЕ ПРОДУКТЫ» и ТОЛЬКО в квадратных скобках [id].
- Разные типы выплаты и разные базовые активы: не больше двух продуктов одного типа.
- why — почему это агенту СЕГОДНЯ: связь с новостью дня либо с тем, что он уже продаёт. Одна короткая фраза, до 100 знаков.
- В why НЕ пиши цифры, проценты и цены: их страница показывает сама из данных.
- Запрещены слова «нота», «гарантированный», «доходность», «прибыль».
- Не давай инвестиционных рекомендаций и обещаний. Пиши по-русски, по-деловому, без эмодзи.`;

async function picksBuild(env, ref) {
  const cat = await buildCatalog(env);
  const instr = (cat && cat.instr) || [];
  if (!instr.length) return { basis: "нет каталога", picks: [], problems: ["каталог пуст"] };

  const deals = await dealsGet(env, ref);
  const book = picksBook(deals, (cat && cat.issues) || []);
  const morning = await morningContext(env);

  // Без ключа модели персонализации не будет — честно отдаём общий подбор.
  if (!env.DEEPSEEK_API_KEY && !env.YANDEX_API_KEY && !env.ANTHROPIC_API_KEY) {
    return { basis: "общая", picks: picksFallback(instr, PICKS_N), problems: ["модель не подключена"] };
  }

  const parts = [];
  if (morning && morning.news) parts.push("НОВОСТИ ДНЯ (" + morning.label + "):\n" + morning.news);
  parts.push(book.length
    ? "КНИГА АГЕНТА (что он уже продаёт):\n" + book.join("\n")
    : "КНИГА АГЕНТА: пока пусто — он ещё ничего не продал.");
  parts.push(cat.text);

  const provider = (env.CHAT_PROVIDER || "deepseek").toLowerCase();
  let picks = [], problems = [], basis = "персональная";
  let messages = [{ role: "user", content: parts.join("\n\n") }];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw;
    try {
      raw = await callLLM(provider, PICKS_SYSTEM, messages, env,
        { temperature: 0.5, maxTokens: 700, json: true });
    } catch (e) { problems.push("модель не ответила"); break; }
    let parsed = null;
    try { parsed = JSON.parse(String(raw).replace(/^[^{]*/, "").replace(/[^}]*$/, "")); } catch (e) { parsed = null; }
    const res = picksLint(parsed && parsed.picks, instr);
    picks = res.picks; problems = res.problems;
    if (picks.length >= PICKS_N) break;
    if (attempt === 0) {
      messages = messages.concat([{ role: "assistant", content: String(raw).slice(0, 900) },
        { role: "user", content: "Не годится: " + (problems.join("; ") || "мало позиций") +
          ". Верни ровно " + PICKS_N + " позиции строго по правилам." }]);
    }
  }

  // Недобрали — дополняем кодом, но говорим об этом на странице.
  if (picks.length < PICKS_N) {
    const have = {};
    for (const p of picks) have[p.id] = 1;
    for (const f of picksFallback(instr, PICKS_N * 2)) {
      if (picks.length >= PICKS_N) break;
      if (!have[f.id]) { picks.push(f); have[f.id] = 1; }
    }
    basis = picks.some((p) => p.why) ? "частично" : "общая";
  }
  return { basis: basis, picks: picks, problems: problems };
}

async function handlePicks(request, env, cors) {
  let d;
  try { d = await request.json(); } catch (e) { return json({ ok: false, error: "bad_json" }, 400, cors); }
  const who = await deskLogin(env, d.id, d.key);
  if (!who) return json({ ok: false, error: "bad_key" }, 403, cors);
  const ref = who.ref, day = mskDate().key, key = "picks:" + ref + ":" + day;

  if (env.POST_KV) {
    try {
      const hit = await env.POST_KV.get(key, "json");
      if (hit && hit.picks) return json({ ok: true, cached: true, date: day, ...hit }, 200, cors);
    } catch (e) { /* кэш необязателен */ }
  }

  let built;
  try { built = await picksBuild(env, ref); }
  catch (e) { return json({ ok: false, error: "build_failed" }, 502, cors); }

  if (env.POST_KV && built.picks && built.picks.length) {
    try {
      await env.POST_KV.put(key, JSON.stringify({ basis: built.basis, picks: built.picks }),
                            { expirationTtl: PICKS_TTL });
    } catch (e) { /* не смогли закэшировать — не беда */ }
  }
  return json({ ok: true, cached: false, date: day, basis: built.basis, picks: built.picks }, 200, cors);
}

async function handleStats(request, env, cors) {
  if (!env.SALES_KEYS && !env.PARTNER_KEYS) return json({ ok: false, error: "not_configured" }, 503, cors);
  let d;
  try { d = await request.json(); } catch (e) { return json({ ok: false, error: "bad_json" }, 400, cors); }
  const who = await deskLogin(env, d.id, d.key);
  if (!who) return json({ ok: false, error: "bad_key" }, 403, cors);
  const ref = who.ref;
  if (!env.POST_KV) return json({ ok: false, error: "no_storage" }, 503, cors);

  const events = [];
  let cursor = null, pages = 0, truncated = false;
  do {
    let r;
    try {
      r = await env.POST_KV.list({ prefix: "hit:" + ref + ":", limit: 1000, cursor: cursor || undefined });
    } catch (e) { return json({ ok: false, error: "storage_failed" }, 502, cors); }
    for (const k of r.keys) if (k.metadata && k.metadata.ts) events.push(k.metadata);
    cursor = r.list_complete ? null : r.cursor;
    if (cursor && ++pages >= HIT_PAGES) { truncated = true; cursor = null; }
  } while (cursor);

  const now = Date.now(), D = 86400000;
  const byProd = new Map(), byDay = new Map();
  let opens = 0, opens7 = 0, opens30 = 0, views = 0, leads = 0, leads30 = 0, last = 0;
  for (const e of events) {
    const age = now - e.ts;
    if (e.ts > last) last = e.ts;
    if (e.t === "lead") { leads++; if (age <= 30 * D) leads30++; }
    else if (e.t === "view") { views++; }
    else { opens++; if (age <= 7 * D) opens7++; if (age <= 30 * D) opens30++; }
    const id = e.p || "—";
    const row = byProd.get(id) || { p: id, opens: 0, views: 0, leads: 0, last: 0 };
    if (e.t === "lead") row.leads++; else if (e.t === "view") row.views++; else row.opens++;
    if (e.ts > row.last) row.last = e.ts;
    byProd.set(id, row);
    // По дням рисуем ТОЛЬКО открытия: это ровно «сколько раз открыли мои ссылки»,
    // просмотры внутри визита раздували бы график без нового смысла.
    if (e.t !== "lead" && e.t !== "view" && age <= 30 * D) {
      const k = mskDay(e.ts);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }
  }
  const products = [...byProd.values()]
    .sort((a, b) => (b.opens + b.views + b.leads) - (a.opens + a.views + a.leads)).slice(0, 60);
  const days = [...byDay.entries()].map(([d2, n]) => ({ d: d2, n })).sort((a, b) => a.d < b.d ? -1 : 1);

  // Сделки — главное на столе, поэтому идут первыми и вместе с итогами по валютам.
  const deals = (await dealsGet(env, ref)).slice().sort(function (a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0);
  });

  return json({
    ok: true, ref, kind: who.kind, now,
    profile: await pinfoGet(env, ref),
    deals: deals, totals: dealTotals(deals),
    opens: { all: opens, d7: opens7, d30: opens30 },
    views: { all: views },
    leads: { all: leads, d30: leads30 },
    last, products, days, truncated,
  }, 200, cors);
}

// --- Чат-ассистент (консьерж по сайту) → Claude API ---
const SYSTEM_PROMPT = `Ты — AI-ассистент-консьерж на сайте компании Rumberg, витрине структурных продуктов для квалифицированных инвесторов. Отвечай по-русски, дружелюбно и профессионально, по делу.

У тебя есть АКТУАЛЬНЫЙ КАТАЛОГ (ниже в этом промпте) — твой источник правды о продуктах:
- спрашивают текущие продукты (в т.ч. по базовому активу — «на ОФЗ», «на индекс», «в долларах») — найди подходящие в разделе ТЕКУЩИЕ ПРОДУКТЫ и перечисли: название, базовый актив, цену;
- дают ISIN или название выпуска — найди его в разделе РАЗМЕЩЁННЫЕ ВЫПУСКИ и расскажи параметры: базовый актив, купон/участие, Bid (если есть);
- если в каталоге ничего не нашлось — честно скажи, что не нашёл, и предложи уточнить у менеджера. НИКОГДА не выдумывай ISIN, цены, купоны или выпуски, которых нет в каталоге.

Стиль ответов (важно):
- Пиши аккуратно и читаемо. Названия продуктов выделяй **жирным**; списки — короткими строками, каждый пункт с новой строки, без «воды».
- НИКОГДА не показывай внутренние идентификаторы (id вроде D-OFZ-1226) и НЕ вставляй конкретные календарные даты (никаких «18.12.2026», «до 14.07.2027»). Срок называй длительностью, только если она уже есть в названии продукта («1 год», «3 года»); иначе срок не упоминай.
- Не перегружай деталями: в списке достаточно названия, базового актива и цены.
- Тон — дружелюбный, спокойный, профессиональный.

Также простыми словами объясняешь, как устроены структурные продукты (дисконтные облигации, облигации с защитой капитала, автоколлы, барьерные облигации, call-spread, варранты): профиль выплаты, риск, срок.

Разделы сайта: «Дайджест» — инвестидея недели; «На размещении» — выпуски, которые размещаем сейчас; «Текущие продукты» (доска) — прайсинг; «Размещённые выпуски» — что уже сделали, с документами; «Библиотека» — как работают продукты. Заинтересовался продуктом — предложи нажать «Обсудить продукт» на странице или кнопку «Обсудить с Румбергом» в чате: заявка уйдёт менеджеру.

Строгие правила:
- НЕ давай индивидуальных инвестиционных рекомендаций и прогнозов доходности, не советуй «покупать/продавать». Мягко поясни, что не даёшь инвестсоветов, и предложи менеджера.
- Конкретные цифры бери только из каталога; вне каталога — не выдумывай.
- При уместности напоминай: информация для квалифицированных инвесторов и не является индивидуальной инвестиционной рекомендацией.
- Отвечай только про структурные продукты и этот сайт; на постороннее вежливо возвращай к теме.`;

// Живой каталог с сайта (кэш в изоляте, TTL 5 мин). Парсим сгенерированные JSON-файлы.
// Кэшируем и сырые массивы — по ним строится контекст конкретного продукта (см. productContext).
let CATALOG = { text: "", at: 0, instr: [], offers: [] };

async function fetchDataObj(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const t = await r.text();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

async function buildCatalog(env) {
  const now = Date.now();
  if (CATALOG.text && now - CATALOG.at < 5 * 60 * 1000) return CATALOG;
  const base = (env.SITE_BASE || "https://invest.rumberg.ru/").replace(/\/?$/, "/");
  const [site, plc, off, dig] = await Promise.all([
    fetchDataObj(base + "data/instruments.js"),
    fetchDataObj(base + "data/placements.js"),
    fetchDataObj(base + "data/offerings.js"),
    fetchDataObj(base + "data/digest.js"),
  ]);
  const lines = [];
  const instr = (site && site.instruments) || [];
  if (instr.length) {
    lines.push("ТЕКУЩИЕ ПРОДУКТЫ (доска, можно предложить сейчас):");
    for (const p of instr) {
      // У автоколла quote — это КУПОН годовых, а не цена входа (вход по номиналу).
      // Без этой ветки агент отвечал «цена 20%» и вводил клиента в заблуждение.
      const price = p.type === "autocall"
        ? "купон " + (p.couponPa != null ? p.couponPa : p.quote) + "% годовых · вход по номиналу · купонный барьер " +
          (p.couponBarrier || p.protectionPct || 65) + "% · автоотзыв " + (p.callBarrier || 120) +
          "% · защита " + (p.protectionPct || 65) + "% · worst-of"
        : p.type === "protection"
        ? "вход по номиналу · защита " + (p.protectionPct != null ? p.protectionPct : 100) +
          "% · участие в росте " + Math.round((p.participation || 1) * 100) + "%" +
          (p.strike > 100 ? " выше страйка " + p.strike + "%" : "")
        : p.quote != null && "цена " + p.quote + "%";
      lines.push("- [" + p.id + "] " + [p.name, p.underlying && "базовый актив: " + p.underlying,
        price].filter(Boolean).join(" · "));
    }
  }
  const offers = (off && off.items) || [];
  if (offers.length) {
    lines.push("", "НА РАЗМЕЩЕНИИ СЕЙЧАС (первичный рынок):");
    for (const o of offers) {
      lines.push("- [" + o.id + "] " + [o.name, o.reference && "базовый актив: " + o.reference,
        o.price != null && "цена " + o.price + "% номинала", o.tenor && "срок " + o.tenor,
        o.isin && "ISIN " + o.isin, o.statusLabel].filter(Boolean).join(" · "));
    }
  }
  const idea = dig && dig.issues && dig.issues[0];
  if (idea && Array.isArray(idea.ideas) && idea.ideas.length) {
    lines.push("", "ИДЕЯ НЕДЕЛИ (дайджест, раздел «Дайджест» на сайте):");
    for (const i of idea.ideas) {
      lines.push("- " + [i.name, i.underlying && "актив: " + i.underlying,
        i.teaser].filter(Boolean).join(" · "));
    }
  }
  const iss = (plc && plc.issues) || [];
  if (iss.length) {
    lines.push("", "РАЗМЕЩЁННЫЕ ВЫПУСКИ (уже размещены; поиск по ISIN):");
    for (const i of iss) {
      const assets = (i.basket || []).map((b) => b.n).filter(Boolean).join(", ");
      const kind = i.kind === "participation" ? "участие в росте" : "купонный/автоколл";
      const pay = i.kind === "participation"
        ? (i.payoff && i.payoff.participationPct != null && "участие " + i.payoff.participationPct + "%")
        : (i.payoff && i.payoff.couponPa != null && "купон " + i.payoff.couponPa + "% годовых");
      lines.push("- " + [i.serial, "ISIN " + i.isin, kind, assets && "актив: " + assets,
        pay, i.bid != null && "Bid " + i.bid + "%"].filter(Boolean).join(" · "));
    }
  }
  CATALOG = { text: lines.join("\n"), at: now, instr, offers, issues: iss, ideas: (idea && idea.ideas) || [] };
  return CATALOG;
}

// Полные параметры инструмента доски — то, что видно в паспорте продукта на сайте.
function describeInstr(p) {
  const parts = ["Название: " + p.name, p.underlying && "Базовый актив: " + p.underlying];
  if (p.type === "warrant") {
    const cs = p.structure === "cs";
    parts.push("Тип: " + (cs ? "колл-спред (CALL с потолком)" : "CALL-варрант"));
    parts.push("Страйк K: " + p.strike + "% от начального уровня" + (p.strike2 ? ", потолок K₂: " + p.strike2 + "%" : ""));
    if (p.quote != null) parts.push("Котировка (премия): " + p.quote + "% от номинала, индикативно");
    parts.push("Выплата на экспирацию: max(S − K; 0) в % номинала" + (p.strike2 ? ", но не выше K₂ − K = " + (p.strike2 - p.strike) + "%" : "") +
      "; безубыток — уровень актива " + (p.strike + (p.quote || 0)) + "%");
  } else if (p.type === "discount") {
    if (p.quote != null) parts.push("Цена входа: " + p.quote + "% номинала (индикативно), погашение 100% при отсутствии кредитного события");
    if (p.about) parts.push("О компании: " + p.about);
  }
  if (p.tenor) parts.push("Срок: " + p.tenor + (p.expiry ? " (до " + p.expiry + ")" : ""));
  if (p.minNom) parts.push("Мин. номинал: " + p.minNom + " ₽");
  return parts.filter(Boolean).join("\n");
}

// Контекст того, что клиент открыл прямо сейчас: по URL страницы находим инструмент доски
// (instrument.html?id=X, p/X.html, board.html#X — на доске паспорт пишется в hash), режим
// сравнения (board.html?cmp=A,B), выпуск первички (offerings.html#id) или идею дайджеста
// (digest.html#выпуск/идея). Агент отвечает про конкретный продукт, а не про каталог вообще.
function productContext(cat, pageUrl) {
  if (!pageUrl) return "";
  const findInstr = (id) => (cat.instr || []).find((x) => x.id === id);

  let m = pageUrl.match(/instrument\.html\?[^#]*\bid=([\w.-]+)/) ||
          pageUrl.match(/\/p\/([\w.-]+)\.html/) ||
          pageUrl.match(/board\.html(?:\?[^#]*)?#([\w.-]+)/);
  if (m) {
    const p = findInstr(decodeURIComponent(m[1]));
    if (p) return describeInstr(p);
  }

  // Сравнение на доске: клиент выбирает между продуктами — даём оба (три) целиком,
  // чтобы агент сравнивал по реальным параметрам, а не по названиям.
  m = pageUrl.match(/board\.html\?[^#]*\bcmp=([^&#]+)/);
  if (m) {
    const list = decodeURIComponent(m[1]).split(",").map((s) => s.trim()).filter(Boolean)
      .slice(0, 3).map(findInstr).filter(Boolean);
    if (list.length) {
      return "Клиент сравнивает эти продукты между собой:\n\n" +
        list.map(describeInstr).join("\n— — —\n");
    }
  }

  m = pageUrl.match(/offerings\.html(?:\?[^#]*)?#([\w.-]+)/);
  if (m) {
    const o = (cat.offers || []).find((x) => x.id === decodeURIComponent(m[1]));
    if (o) {
      return [
        "Название: " + o.name, o.kind && "Тип: " + o.kind, o.reference && "Базовый актив: " + o.reference,
        o.price != null && "Цена размещения: " + o.price + "% номинала", o.tenor && "Срок: " + o.tenor,
        o.isin && "ISIN: " + o.isin, o.venue && "Площадка: " + o.venue, o.statusLabel && "Статус: " + o.statusLabel,
        o.teaser,
      ].filter(Boolean).join("\n");
    }
  }

  // Дайджест: hash вида #<id выпуска>/<id идеи>. Идея — это продукт плюс наша аргументация,
  // её и отдаём: клиент спрашивает «почему вы так считаете» именно про этот текст.
  m = pageUrl.match(/digest\.html(?:\?[^#]*)?#[\w.-]+\/([\w.-]+)/);
  if (m) {
    const i = (cat.ideas || []).find((x) => x.id === decodeURIComponent(m[1]));
    if (i) {
      return ["Идея недели из дайджеста Rumberg.", "Название: " + i.name,
        i.underlying && "Базовый актив: " + i.underlying, i.teaser && "Тизер: " + i.teaser,
        i.hypothesis && "Наша гипотеза: " + i.hypothesis,
        i.situation && "Рыночная ситуация: " + i.situation,
        i.factors && i.factors.length && "Факторы за идею: " + i.factors.join("; "),
        i.conclusion && "Вывод: " + i.conclusion,
        i.how && "Как заработать: " + i.how, i.payout && "Структура выплаты: " + i.payout,
        i.tenor && "Срок: " + i.tenor,
      ].filter(Boolean).join("\n");
    }
  }
  return "";
}

async function handleChat(request, env, cors, ctx) {
  // Защита от абуза: только с нашего сайта (если задан ALLOW_ORIGIN)
  const origin = request.headers.get("Origin") || "";
  if (env.ALLOW_ORIGIN && env.ALLOW_ORIGIN !== "*" && origin && origin !== env.ALLOW_ORIGIN) {
    return json({ ok: false, error: "forbidden_origin" }, 403, cors);
  }

  // Антиспам по IP (если настроен биндинг Rate Limiting CHAT_RATE_LIMIT; иначе шаг пропускается)
  if (env.CHAT_RATE_LIMIT) {
    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    try {
      const rl = await env.CHAT_RATE_LIMIT.limit({ key: ip });
      if (rl && rl.success === false) return json({ ok: false, error: "rate_limited" }, 429, cors);
    } catch (e) { /* биндинг недоступен — не блокируем */ }
  }

  // Гео-гейт: страна клиента (Cloudflare проставляет request.cf.country). Для стран из
  // списка AI-чат отключаем — виджет покажет вежливый фолбэк в Telegram. Список — через env.
  const blocked = (env.CHAT_BLOCKED_COUNTRIES || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const country = (request.cf && request.cf.country) || "";
  if (country && blocked.includes(country)) {
    return json({ ok: false, error: "region_unavailable" }, 200, cors);
  }

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400, cors); }

  // История: не более 20 последних сообщений, каждое ≤ 2000 символов
  const raw = Array.isArray(data.messages) ? data.messages.slice(-20) : [];
  const messages = [];
  for (const m of raw) {
    const role = m && m.role === "assistant" ? "assistant" : "user";
    const content = (m && typeof m.content === "string" ? m.content : "").trim().slice(0, 2000);
    if (content) messages.push({ role, content });
  }
  if (!messages.length) return json({ ok: false, error: "empty" }, 422, cors);
  if (messages[messages.length - 1].role !== "user") return json({ ok: false, error: "last_not_user" }, 422, cors);

  const pageTitle = String((data.page && data.page.title) || "").slice(0, 200);
  const pageUrl = String((data.page && data.page.url) || "").slice(0, 300);
  let cat = { text: "", instr: [], offers: [], ideas: [] };
  try { cat = await buildCatalog(env); } catch (e) { /* каталог необязателен */ }
  const prodCtx = productContext(cat, pageUrl);
  // Режим партнёра: рабочий стол (me.html) прикладывает к запросу пару ID+ключ.
  // Валидная пара — тот же deskLogin, что у /stats и /picks — включает блок про
  // выпуски партнёра. Невалидная или отсутствующая просто игнорируется: чат
  // отвечает как обычному посетителю, ошибкой это не является.
  let partnerMode = false, partnerCtx = "", partnerHasDeals = false;
  if (data.partner && data.partner.id && data.partner.key) {
    const pwho = await deskLogin(env, data.partner.id, data.partner.key);
    if (pwho) {
      partnerMode = true;
      try {
        const pdeals = await dealsGet(env, pwho.ref);
        partnerHasDeals = pdeals.length > 0;
        partnerCtx = partnerChatContext(pdeals, cat.issues || []);
      } catch (e) { /* книга необязательна */ }
    }
  }
  let morn = null;
  try { morn = await morningContext(env); } catch (e) { /* контекст необязателен */ }
  const system = SYSTEM_PROMPT +
    (cat.text ? "\n\n=== АКТУАЛЬНЫЙ КАТАЛОГ ===\n" + cat.text : "") +
    (morn ? "\n\n=== РЫНОЧНЫЙ КОНТЕКСТ (" + morn.label + ", аналитика Rumberg) ===\n" + morn.news +
            "\nИспользуй как фон при вопросах о рынке, ссылайся как на «наш утренний обзор». " +
            "О событиях позже этой даты данных нет — так и говори. Прогнозов и обещаний доходности из него не выводи." : "") +
    (pageTitle ? `\n\nСейчас клиент на странице: «${pageTitle}»${pageUrl ? " (" + pageUrl + ")" : ""}.` : "") +
    (prodCtx ? "\n\n=== ПРОДУКТ, КОТОРЫЙ КЛИЕНТ СЕЙЧАС СМОТРИТ (отвечай в первую очередь про него) ===\n" + prodCtx : "") +
    (partnerMode ? "\n\n=== РЕЖИМ ПАРТНЁРА (рабочий стол) ===\n" +
      "Сейчас с тобой говорит НЕ клиент, а партнёр-агент Rumberg: он продаёт наши продукты своим клиентам и пишет со своего рабочего стола. Помогай ему готовить ответы клиентам: объясняй параметры его выпусков простыми словами, предлагай нейтральные формулировки для разговора с клиентом, сравнивай с продуктами каталога. Запрет инвестрекомендаций и правила стиля действуют и здесь. Кнопку «Обсудить с Румбергом» ему предлагать не нужно — он и так на связи со своим менеджером Rumberg.\n" +
      (partnerCtx ? "Выпуски этого партнёра (наши данные, все параметры публичные):\n" + partnerCtx
                  : partnerHasDeals
                    ? "Данные по выпускам этого партнёра сейчас недоступны — отвечай по каталогу и его выпуски не выдумывай."
                    : "Размещённых выпусков за этим партнёром в наших данных пока нет.") +
      "\nОбъёмы сделок и вознаграждение партнёра тебе не переданы — про них отвечай, что точные цифры видны на его столе." : "");

  const provider = (env.CHAT_PROVIDER || "yandex").toLowerCase();

  // Стриминг: фронт просит stream:true, провайдер умеет SSE (deepseek/claude).
  // Ответ печатается по мере генерации — ощущение скорости. Ошибки отдаём обычным
  // JSON: фронт различает по Content-Type и уходит в старую ветку.
  if (data.stream === true && (provider === "deepseek" || provider === "claude")) {
    return streamChat(provider, system, messages, env, cors);
  }

  let reply;
  try {
    if (provider === "deepseek") reply = await callDeepSeek(system, messages, env);
    else if (provider === "claude") reply = await callClaude(system, messages, env);
    else reply = await callYandex(system, messages, env);
  } catch (e) {
    const msg = String((e && e.message) || e);
    return json({ ok: false, error: msg }, msg === "not_configured" ? 503 : 502, cors);
  }

  // Лог диалога (без контактов: вопрос/ответ/страница) — в отдельный тихий TG-чат,
  // если задан CHAT_LOG_CHAT_ID. Не задерживаем ответ клиенту: waitUntil, где доступен.
  if (env.CHAT_LOG_CHAT_ID && reply) {
    const q = messages[messages.length - 1].content.slice(0, 600);
    const logP = tg(env, "sendMessage", {
      chat_id: env.CHAT_LOG_CHAT_ID, parse_mode: "HTML", disable_web_page_preview: true,
      text: "💬 <b>AI-чат</b>" + (pageTitle ? " · " + esc(pageTitle) : "") +
        "\n<b>Q:</b> " + esc(q) + "\n<b>A:</b> " + esc(String(reply).slice(0, 500)),
    }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(logP); else await logP;
  }

  return json({ ok: true, reply: reply || "Извините, не удалось сформировать ответ." }, 200, cors);
}

// --- Стриминг ответа ассистента (SSE) ---
// Отдаём SSE провайдера КАК ЕСТЬ, без нашего JS в петле стрима: тело апстрима
// уходит клиенту напрямую, байты перекладывает сам runtime.
// Почему так, а не «свой протокол»: попытки трансформировать поток в воркере
// (и через body.pipeThrough(JS-трансформ), и через ручной насос с ctx.waitUntil)
// в бою стабильно вставали после ~700–800 байт — соединение висело без ошибки и
// без закрытия. Прямой проброс этот класс проблем убирает.
// Разбор формата (OpenAI-совместимый choices[0].delta.content у deepseek либо
// Anthropic delta.text) делает фронт — см. readStream() в chat.js.
// Побочный эффект: тихий лог диалога (CHAT_LOG_CHAT_ID) для стримовых ответов не
// пишется — воркер их текст не видит. Для нестримовой ветки лог сохранён.
async function streamChat(provider, system, messages, env, cors) {
  let upstream;
  try {
    upstream = provider === "claude"
      ? await callClaude(system, messages, env, { stream: true })
      : await callDeepSeek(system, messages, env, { stream: true });
  } catch (e) {
    const m = String((e && e.message) || e);
    return json({ ok: false, error: m }, m === "not_configured" ? 503 : 502, cors);
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    return json({ ok: false, error: "upstream_" + (upstream ? upstream.status : "no_body") }, 502, cors);
  }

  // Тело апстрима уходит клиенту напрямую — байты перекладывает runtime, нашего JS
  // в петле стрима нет. Формат SSE провайдера разбирает фронт (readStream в chat.js).
  return new Response(upstream.body, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// YandexGPT (Yandex Cloud Foundation Models) — основной провайдер /chat
async function callYandex(system, messages, env, opts = {}) {
  const key = (env.YANDEX_API_KEY || "").trim();
  const folder = (env.YANDEX_FOLDER_ID || "").trim();
  if (!key || !folder) throw new Error("not_configured");
  const model = (env.YANDEX_MODEL || "yandexgpt/latest").trim();
  const body = {
    modelUri: "gpt://" + folder + "/" + model,
    completionOptions: { stream: false,
      temperature: opts.temperature != null ? opts.temperature : 0.3,
      // бюджет обязан приходить снаружи: утренний JSON в 800 токенов не влезает
      maxTokens: String(opts.maxTokens != null ? opts.maxTokens : 800) },
    messages: [{ role: "system", text: system }].concat(
      messages.map((m) => ({ role: m.role, text: m.content }))
    ),
  };
  const r = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
    method: "POST",
    headers: { "Authorization": "Api-Key " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("upstream_" + r.status);
  const data = await r.json();
  const alt = data && data.result && data.result.alternatives && data.result.alternatives[0];
  return ((alt && alt.message && alt.message.text) || "").trim();
}

// DeepSeek (OpenAI-совместимый API) — провайдер /chat (CHAT_PROVIDER=deepseek)
async function callDeepSeek(system, messages, env, opts = {}) {
  const key = (env.DEEPSEEK_API_KEY || "").trim();
  if (!key) throw new Error("not_configured");
  const model = (opts.model || env.DEEPSEEK_MODEL || "deepseek-chat").trim();
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }].concat(
        messages.map((m) => ({ role: m.role, content: m.content }))
      ),
      temperature: opts.temperature != null ? opts.temperature : 0.3,
      max_tokens: opts.maxTokens != null ? opts.maxTokens : 800, stream: !!opts.stream,
      // json-режим: модель обязана вернуть валидный JSON (нужен утреннему конвейеру)
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (opts.stream) return r;   // сырой ответ — его SSE перекладывает streamChat()
  if (!r.ok) throw new Error("upstream_" + r.status);
  const data = await r.json();
  const c = data && data.choices && data.choices[0];
  // json-режим: упор в max_tokens отдаёт недописанный JSON без внешних признаков —
  // сигналим вызывающему, чтобы ретрай знал настоящую причину, а не гадал
  if (opts.json && c && c.finish_reason === "length") throw new Error("upstream_length");
  return ((c && c.message && c.message.content) || "").trim();
}

// Claude (Anthropic) — запасной провайдер (CHAT_PROVIDER=claude) и провайдер постов
async function callClaude(system, messages, env, opts = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("not_configured");
  const body = {
    model: opts.model || env.CHAT_MODEL || "claude-haiku-4-5",
    max_tokens: opts.maxTokens != null ? opts.maxTokens : 500,
    system, messages,
  };
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.stream) body.stream = true;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (opts.stream) return r;   // сырой ответ — его SSE перекладывает streamChat()
  if (!r.ok) throw new Error("upstream_" + r.status);
  const data = await r.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

// ============================================================================
// Авто-посты: 3 короткие идеи для канала агентов по живому каталогу → в личку
// ============================================================================

// Провайдер постов независим от чата: POST_PROVIDER (по умолчанию — как у чата).
async function callLLM(provider, system, messages, env, opts) {
  const p = (provider || "deepseek").toLowerCase();
  if (p === "claude") return callClaude(system, messages, env, opts);
  if (p === "yandex") return callYandex(system, messages, env, opts);
  return callDeepSeek(system, messages, env, opts);
}

const POST_SYSTEM = `Ты — контент-редактор Telegram-канала компании Rumberg для агентов по продажам (структурные продукты для квалифицированных инвесторов). Твоя задача — дать 5 КОРОТКИХ идей постов на день. Цель — подтолкнуть агента к сделке и переходу на сайт. Минимум информации, никакого перегруза.

Формат ответа — РОВНО 5 идей, каждая отдельным блоком строго в таком виде:
[id продукта из каталога]
<эмодзи> **Цепляющий заголовок**
Одна короткая фраза сути (за что платит инвестор / чем ограничен риск).

Между блоками — пустая строка. Больше НИЧЕГО не пиши: ни нумерации, ни вступления, ни ссылок (ссылки подставит система).

Требования к идеям:
- 5 РАЗНЫХ продуктов из каталога (по возможности разные типы/активы).
- Каждая идея ≤ ~200 знаков: заголовок + одна фраза. Коротко и энергично.
- Название продукта — **жирным**.
- Первая строка каждого блока — идентификатор продукта в квадратных скобках [id] из каталога (он в начале каждой строки продукта). Нужен, чтобы система подставила ссылку.

ЖЁСТКИЕ ПРАВИЛА (нарушение недопустимо):
- Продукты, цифры, ISIN, цены бери ТОЛЬКО из каталога ниже. Ничего не выдумывай.
- НЕ обещай доходность и НЕ пиши «X% годовых». Цену/премию помечай словом «индикативно».
- Ты НЕ знаешь актуальных новостей, курсов и решений ЦБ. НИКОГДА не утверждай конкретные свежие события («ЦБ сохранил/снизил ставку», «рынок вчера…», «ставки на паузе»). Зацепку давай ТОЛЬКО обобщённо и условно («когда ставки снижаются — цена облигаций растёт», «на развороте ставок», «в периоды просадки»), без привязки к факту, который не можешь проверить.
- Слово «Нота»/«нота» запрещено. Пиши «варрант», «структурная облигация», «дисконтная облигация» или конкретный тип.
- Без индивидуальных инвестрекомендаций. В тексте идей НЕ пиши внутренние id и конкретные даты (кроме тех, что уже есть в названии/статусе продукта).
- Дисклеймер НЕ добавляй — его добавит система.`;

const POST_DISCLAIMER = "Не является индивидуальной инвестиционной рекомендацией. Только для квалифицированных инвесторов.";

// Зацепка для продукта, который добрал код (модель не дала пять непересекающихся по
// типу). Без цифр и без отсылки к теме дня: код их не знает, а придуманная цифра
// в посте опаснее отсутствующей — за параметрами агент идёт по ссылке.
const MORNING_HOOK_FALLBACK = "Ещё одна идея на сегодня — условия и график выплаты на странице продукта.";

// ============================================================================
// Утренний пост: статья аналитика (личка бота) → сжатые новости + продукты дня
// ============================================================================
const MORNING_SYSTEM = `Ты — редактор утреннего поста Telegram-канала компании Rumberg для агентов по продажам (структурные продукты, только квалифицированные инвесторы). Тебе дают утренний обзор аналитика и каталог продуктов.

Ответь ОДНИМ валидным JSON-объектом без какого-либо текста вокруг, строго по схеме:
{"news":[
  {"flag":"🌍","title":"<тезис 2–4 слова>","text":"<1–2 предложения по геополитике/сырью из статьи, в конце короткий вывод; до 300 знаков>","long":["<абзац>","<абзац>"]},
  {"flag":"🇺🇸","title":"<тезис>","text":"<1–2 предложения по рынку США из статьи; до 300 знаков>","long":["<абзац>","<абзац>"]},
  {"flag":"🇷🇺","title":"<тезис>","text":"<1–2 предложения по российскому рынку из статьи; до 300 знаков>","long":["<абзац>","<абзац>"]}
],"products":[
  {"id":"<id из каталога>","headline":"<эмодзи + цепляющий заголовок, до 60 знаков>","hook":"<одна фраза до 140 знаков: отсылка к теме дня + за что платит инвестор>"},
  {"id":"<id>","headline":"<...>","hook":"<...>"},
  {"id":"<id>","headline":"<...>","hook":"<...>"},
  {"id":"<id>","headline":"<...>","hook":"<...>"},
  {"id":"<id>","headline":"<...>","hook":"<...>"}
]}

ЖЁСТКИЕ ПРАВИЛА (нарушение = брак):
- title — газетный тезис с характером («Мир хрупок», «Ставки не спешат вниз»), НЕ сухая рубрика («Геополитика», «Рынок США» — брак). Без кликбейта: факт из статьи обязан тезис подтверждать. Без точки в конце.
- text: факты и цифры ТОЛЬКО из статьи аналитика. Цифры переноси КАК В СТАТЬЕ — не округляй и не «освежай» из своих знаний. Чего в статье нет — того не пишешь.
- long — РАЗВЁРНУТАЯ версия того же блока для страницы разборов на сайте: 1–3 абзаца, всего 3–6 предложений, до 800 знаков. Тот же материал, что в text, но подробнее: детали, причины и цифры ИЗ СТАТЬИ, которые в короткую версию не влезли. Ничего нового не придумывай — то, чего нет в статье, писать нельзя. Абзацы — отдельные строки массива.
- Если статья тему блока НЕ покрывает — НЕ сочиняй: поставь title "Без обновлений", text "Эту тему сегодняшний обзор не затрагивает." и long []. Такой блок в пост не попадёт.
- Флаги строго в порядке схемы: news[1] всегда 🌍, news[2] всегда 🇺🇸, news[3] всегда 🇷🇺.
- products: ровно 5 РАЗНЫХ продуктов, id бери ТОЛЬКО из [скобок] в начале строк каталога. Подбирай под темы статьи: разворот/снижение ставок → облигации и варранты на ОФЗ; слабый рубль → валютные активы (CNY, USD); сырьё/акции → соответствующие базовые активы.
- ТИПЫ ПЭЙОФФА НЕ ПОВТОРЯЮТСЯ. Тип написан в скобках сразу после [id] в каталоге: (варрант), (дисконтная облигация), (защита капитала), (автоколл), (бустер), (биржевой выпуск). Из пяти позиций допустимо максимум ОДНО совпадение по типу — значит разных типов должно быть не меньше четырёх. Пять варрантов подряд — брак. Если под тему просится ещё один продукт того же типа, а совпадение уже израсходовано, возьми на тот же базовый актив продукт ДРУГОГО типа.
- Ты пишешь НЕ описание продукта, а сообщение коллеге-агенту: живо, на «вы», с конкретной цифрой. Сухое «участие в росте, индикативно» — брак.
- headline: свой цепляющий заголовок с эмодзи и, по возможности, с цифрой («📈 Рычаг на ОФЗ: платите 10% — рост берёте целиком»). Это НЕ название продукта из каталога, его подставит система отдельной строкой.
- hook: сначала отсылка к теме дня из твоих же блоков news (это факты статьи — на них ссылаться МОЖНО и нужно), потом за что платит инвестор. Про события ВНЕ статьи не пиши.
- ОБЯЗАТЕЛЬНО назови конкретную цифру продукта из его строки каталога (цена/премия/участие) или из его названия (страйк, срок) — в headline или в hook. Числа, которых нет в строке каталога этого продукта и нет в статье, писать НЕЛЬЗЯ.
- Слово «индикативно» ставь ТОЛЬКО рядом с ценой («премия 10% от номинала, индикативно»). Приклеивать его к фразе без цифры — брак.
- НЕ обещай доходность, НЕ пиши «X% годовых», слова «нота» и «гарантированный» запрещены. Внутренние id в тексте не пиши.

Пример ФОРМЫ и ТОНА ответа (содержание всегда бери из статьи и каталога, цифры — оттуда же):
{"news":[{"flag":"🌍","title":"Нефть не верит миру","text":"Переговоры буксуют, поставки под риском — премия за геополитику остаётся в цене.","long":["Переговоры о перемирии идут третью неделю без результата, а поставки из региона остаются под риском: два терминала работают с перебоями.","Рынок закладывает эту неопределённость в цену — премия за геополитику держится, несмотря на слабый спрос."]},{"flag":"🇺🇸","title":"Ставки давят","text":"Доходности длинных бумаг у максимумов, рынок ждёт сигнала ФРС.","long":["Доходность десятилетних бумаг у верхней границы диапазона, аукционы проходят со слабым спросом.","До заседания ФРС рынок не готов брать длинную дюрацию — деньги остаются в коротком конце кривой."]},{"flag":"🇷🇺","title":"Рынок без покупателя","text":"Объёмы торгов низкие, индекс у сопротивления — импульса нет.","long":["Объём торгов третий день ниже среднего, индекс упирается в сопротивление и откатывает.","Покупателя нет ни в первом эшелоне, ни в бумагах роста: инвесторы ждут ясности по ставке."]}],"products":[{"id":"AAA-1","headline":"📈 Рычаг на ОФЗ: платите 12% — рост берёте целиком","hook":"Ставки у максимумов, значит развернуться им есть куда: премия 12% от номинала, индикативно, а участие в росте полное."},{"id":"BBB-2","headline":"💴 Рубль без поддержки — заходите в юань","hook":"Пока покупателя на рынке нет, валютная экспозиция работает страховкой: вход 15% номинала, индикативно."},{"id":"CCC-3","headline":"⛽️ Нефть в напряжении — ускоренный вход","hook":"Геополитика держит премию в цене: рост в диапазоне до 110% считается с коэффициентом 200%."},{"id":"DDD-4","headline":"🛡 Просадка не страшна: защита 100%","hook":"Рынок без покупателя — вход по номиналу, участие в росте 90%, тело возвращается целиком."},{"id":"EEE-5","headline":"🏦 Купон на корзину банков","hook":"Пока индекс у сопротивления, платит время: купон при барьере 65%, автоотзыв на 120%."}]}`;

// Дата по МСК: ключ для KV («2026-08-04») и человеческая подпись («4 августа»)
function mskDate() {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const MON = ["января", "февраля", "марта", "апреля", "мая", "июня",
               "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return {
    key: d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"),
    human: d.getUTCDate() + " " + MON[d.getUTCMonth()],
  };
}

// Контроль цифр: числа из сжатых новостей должны встречаться в статье аналитика.
// LLM любит «освежать» котировки из своих знаний — это единственный способ поймать.
function numbersNotInSource(newsText, article) {
  const norm = (s) => String(s).replace(/\./g, ",");
  // разряды «2 262,75» схлопываем на ОБЕИХ сторонах — иначе дословно перенесённое
  // из статьи число объявлялось выдуманным (пробел или NBSP между цифрами)
  const collapse = (s) => s.replace(/(\d)[  ]+(?=\d)/g, "$1");
  const src = norm(article);
  const srcC = collapse(src);
  // третий вариант источника: срезаны разрядные запятые («5.000»→norm→«5,000»→«5000»)
  const srcT = srcC.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  const out = [];
  // внутри числа допускаем только пробел/NBSP, не \n — перенос строки склеивал
  // числа соседних блоков в один несуществующий кандидат
  for (const m of norm(newsText).matchAll(/\d[\d  ]*(?:,\d+)?/g)) {
    const n = m[0].replace(/[  ]+/g, "");
    if (n.replace(/\D/g, "").length < 3) continue;       // короткие (годы жизни, «30 минут») не проверяем
    let found = false;
    for (const c of [n, n.replace(/,/g, "")]) {          // «5,000» ↔ «5000»
      if (src.includes(c) || srcC.includes(c) || srcT.includes(c)) { found = true; break; }
      // допускаем округление хвоста: «4,684» в статье ↔ «4,68» в посте
      const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\d");
      if (re.test(src) || re.test(srcC) || re.test(srcT)) { found = true; break; }
    }
    if (!found) out.push(m[0].trim());
  }
  return [...new Set(out)];
}

// Достаём JSON из ответа модели: терпим ```json-заборы и болтовню вокруг объекта.
function parseMorningJson(raw) {
  let s = String(raw || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

// Проверка ответа кодом, а не надеждой: каждая проблема — строка-инструкция, которую
// можно вернуть модели на доработку. ids — множество допустимых id (из ОТФИЛЬТРОВАННОГО
// каталога: так дедуп недавних продуктов превращается из просьбы в требование).
const MORNING_FLAGS = ["🌍", "🇺🇸", "🇷🇺"];
// Рубрика для сайта берётся ПО ФЛАГУ, а не по индексу после фильтрации: блоки-заглушки
// («тема не затронута») из массива выпадают, и индексы разъезжаются со слотами схемы.
const MORNING_RUBRICS = { "🌍": "Мир", "🇺🇸": "США", "🇷🇺": "Россия" };
// Шапка data/morning.js. Файл читает главная; тело — строгий JSON, комментарии только здесь.
const MORNING_FILE_HEAD =
  '// УТРЕННИЙ ОБЗОР ДЛЯ ГЛАВНОЙ — колонка «Утро на рынках».\n' +
  '// Файл пишет БОТ по кнопке «На сайт» под утренним постом. Правки руками не запрещены,\n' +
  '// но следующая публикация их перезапишет. Тело — строгий JSON внутри window.MORNING.\n' +
  '//\n' +
  '// Свежесть главная считает сама по полю date: сегодня-вчера — как есть, 2-3 дня —\n' +
  '// подпись «обзор от ДД.ММ», старше трёх дней — заглушка вместо протухших новостей.\n';
// Тема → слот: он же якорь разбора на research.html. Адрес разбора должен быть
// предсказуемым, потому что ссылку на него главная проставляет в ту же секунду.
const MORNING_SLOTS = { "🌍": "world", "🇺🇸": "us", "🇷🇺": "ru" };

// Шапка data/research.js. Тот же принцип, что и у morning.js: комментарии только здесь.
const RESEARCH_FILE_HEAD =
  '// ЛУЧШИЕ ПРОДУКТЫ — разборы рынка для research.html.\n' +
  '// Файл пишет БОТ по кнопке «На сайт» под утренним постом: выпуск за день — это три\n' +
  '// разбора (мир, США, Россия) и общий список продуктов дня. Развёрнутый текст разбора\n' +
  '// и короткая новость на главной делаются из ОДНОЙ статьи аналитика за один проход,\n' +
  '// поэтому страницы не могут разойтись.\n' +
  '//\n' +
  '// Выпуск с той же датой следующая публикация перезапишет целиком; выпуски за другие\n' +
  '// дни бот не трогает — руками добавленные записи переживают публикацию.\n' +
  '// Продукты у выпуска ОБЩИЕ, не привязаны к разбору: конвейер собирает новости и\n' +
  '// продукты отдельными списками, и связь «разбор №1 — продукт №1» изображать нельзя.\n';

// Сколько выпусков держим в архиве. Обзор ежедневный, а страница грузит файл целиком —
// без потолка он за квартал вырастет до сотен килобайт.
const RESEARCH_KEEP = 20;

// Блок-заглушка «тема не покрыта статьёй» — честный выход вместо сочинительства.
// В пост и в morning:latest такие блоки не попадают.
const isMorningStub = (b) => !!(b && typeof b.text === "string" && /не затрагивает/i.test(b.text));

// Развёрнутая версия блока — абзацы для страницы разборов. Модель просят вернуть
// массив, но она иногда отдаёт одну строку: приводим к массису абзацев здесь, а не
// в трёх местах. Пустые строки выбрасываем — они дали бы пустой <p> на странице.
function morningLong(b) {
  const raw = b && b.long;
  const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(/\n{2,}/) : []);
  return arr.map((s) => String(s || "").trim()).filter(Boolean);
}
// catLines: Map(id → строка каталога) — нужна не только для проверки id, но и чтобы
// подтвердить каждую цифру в тексте продукта: требуя конкретику, нельзя разрешить выдумку.
function morningLint(p, catLines, article) {
  const ids = catLines;
  if (!p || typeof p !== "object") return ["ответ не является JSON-объектом — верни один объект по схеме"];
  const probs = [];
  const news = Array.isArray(p.news) ? p.news : [];
  if (news.length !== 3) probs.push("в news должно быть ровно 3 блока (сейчас " + news.length + ")");
  // сухая рубрика вместо тезиса — главный источник «скучных» заголовков
  const RUBRIC = /^(геополитика|сша|рынок сша|россия|российский рынок|рынок рф|рынок|новости|макро|трежерис|treasur\w*|сырьё|нефть)\.?$/i;
  news.forEach((b, i) => {
    const n = "news[" + (i + 1) + "]";
    if (!b || typeof b.title !== "string" || !b.title.trim() || typeof b.text !== "string" || !b.text.trim()) {
      probs.push(n + ": нужны непустые title и text"); return;
    }
    // флаг закреплён за слотом схемы — проверки «из множества» мало: три 🌍 подряд проходили
    if (i < 3 && b.flag !== MORNING_FLAGS[i]) probs.push(n + ": flag должен быть " + MORNING_FLAGS[i] + " (порядок: мир, США, РФ)");
    if (isMorningStub(b)) return;               // заглушке стиль и цифры не проверяем
    if (b.title.trim().split(/\s+/).length > 5) probs.push(n + ": title длиннее 4–5 слов — сократи до тезиса");
    if (RUBRIC.test(b.title.trim())) probs.push(n + ": title «" + b.title.trim() + "» — сухая рубрика, нужен тезис с характером");
    if (b.text.length > 340) probs.push(n + ": text длиннее 320 знаков (" + b.text.length + ") — сожми");
    // long уходит на страницу разборов; без него страница осталась бы пустой,
    // а короткая и развёрнутая версии обязаны быть об одном и том же
    const lng = morningLong(b).join(" ");
    if (!lng) probs.push(n + ": нужен long — развёрнутая версия темы для страницы разборов (1–3 абзаца)");
    else if (lng.length < 200) probs.push(n + ": long короче 200 знаков — это пересказ короткой версии, а нужен разбор");
    else if (lng.length > 900) probs.push(n + ": long длиннее 800 знаков (" + lng.length + ") — сожми");
  });
  const prods = Array.isArray(p.products) ? p.products : [];
  if (prods.length < 5) probs.push("в products должно быть 5 позиций (сейчас " + prods.length + ")");
  const seen = new Set();
  // Тип пэйоффа виден только из строки каталога — его дописывает generateMorning
  // скобками сразу после [id]. Каталог без скобок (старый вызов, фикстура) правило
  // просто не проверяет: лучше не проверить, чем ругаться на пустое место.
  const byType = new Map();
  // ровно 5 — как в рендере: брак 6-го, который никогда не публикуется, сжигал бы ретрай
  prods.slice(0, 5).forEach((pr, i) => {
    const n = "products[" + (i + 1) + "]";
    if (!pr || typeof pr.id !== "string" || typeof pr.hook !== "string" || !pr.hook.trim()) {
      probs.push(n + ": нужны id и hook"); return;
    }
    if (!ids.has(pr.id)) probs.push(n + ": id «" + pr.id + "» нет в каталоге — возьми id из [скобок] строки каталога");
    if (seen.has(pr.id)) probs.push(n + ": продукт повторяется — нужны 5 разных");
    seen.add(pr.id);
    if (pr.hook.length > 160) probs.push(n + ": hook длиннее 140 знаков — сократи");

    const head = typeof pr.headline === "string" ? pr.headline.trim() : "";
    if (!head) probs.push(n + ": нужен headline — свой цепляющий заголовок с эмодзи");
    else if (head.length > 70) probs.push(n + ": headline длиннее 60 знаков — сократи");
    const line = ids.get ? (ids.get(pr.id) || "") : "";
    const tm = line.match(/^- \[[^\]]+\]\s*\(([^)]+)\)/);
    if (tm) { if (!byType.has(tm[1])) byType.set(tm[1], []); byType.get(tm[1]).push(pr.id); }
    if (head && line && line.includes(head)) probs.push(n + ": headline — это название продукта из каталога, нужен СВОЙ заголовок");
    const both = head + " " + pr.hook;
    // конкретика: без цифры зацепка звучит как описание из брошюры
    if (!/\d/.test(both)) probs.push(n + ": нет ни одной конкретной цифры — назови цену/премию/участие или срок из каталога");
    // «индикативно» — только рядом с ценой, иначе это механический хвост
    if (/индикативн/i.test(pr.hook) && !/\d[^.;]{0,30}индикативн/i.test(pr.hook)) {
      probs.push(n + ": «индикативно» без цифры рядом — поставь его к цене или убери");
    }
    // требуя конкретику, обязаны проверить её источник: цифра должна быть в строке
    // каталога этого продукта либо в статье, иначе модель просто придумает цену
    if (line) {
      const src = (line + "\n" + article).replace(/\./g, ",");
      for (const mm of both.replace(/\./g, ",").matchAll(/\d+(?:,\d+)?/g)) {
        if (!src.includes(mm[0])) {
          probs.push(n + ": цифра «" + mm[0] + "» не из строки каталога этого продукта и не из статьи — возьми настоящую");
          break;
        }
      }
    }
  });
  // Одно совпадение по типу допускаем — каталог не резиновый, и под тему дня иногда
  // честно просятся два варранта. Второе совпадение уже делает подборку однообразной,
  // ради чего правило и вводилось: пять идей должны отличаться пэйоффом, а не тикером.
  const dup = [...byType.entries()].filter(([, list]) => list.length > 1);
  const extra = dup.reduce((s, [, list]) => s + list.length - 1, 0);
  if (extra > 1) {
    probs.push("тип пэйоффа повторяется больше одного раза (" +
      dup.map(([t, list]) => t + ": " + list.join(", ")).join("; ") +
      ") — из пяти позиций совпадать может только одна пара, остальные замени продуктами других типов");
  }

  // запрещённые слова (\b не работает с кириллицей — границы через lookaround);
  // {0,3} покрывает падежи «нотой/нотами/нотах», но не пускает «нотацию»
  const all = news.map((b) => ((b && b.title) || "") + " " + ((b && b.text) || ""))
    .concat(prods.map((pr) => (pr && pr.hook) || "")).join("\n");
  if (/(?<![а-яё])нот[а-яё]{0,3}(?![а-яё])/i.test(all)) probs.push("слово «нота» запрещено — назови тип инструмента (варрант, дисконтная облигация)");
  if (/%\s*годовых/i.test(all)) probs.push("«% годовых» запрещено — убери обещание доходности");
  if (/гарантир/i.test(all)) probs.push("«гарантированный» запрещено");
  // цифры в новостях (и заголовках) обязаны быть из статьи; проверяем поблочно, чтобы
  // числа соседних блоков не склеивались; hooks не проверяем — там цены из каталога
  const fake = new Set();
  for (const b of news) {
    if (!b || isMorningStub(b)) continue;
    // развёрнутую версию проверяем тем же контролем: она уходит на сайт как разбор,
    // и выдуманная там цифра ничем не лучше выдуманной в короткой новости
    for (const t of numbersNotInSource(((b.title || "") + " " + (b.text || "") + " " + morningLong(b).join(" ")), article)) fake.add(t);
  }
  if (fake.size) probs.push("цифры не из статьи: " + [...fake].join(", ") + " — возьми точные значения из статьи или убери их");
  return probs;
}

async function generateMorning(env, article) {
  let cat = { text: "", instr: [], offers: [], ideas: [] };
  try { cat = await buildCatalog(env); } catch (e) { /* без каталога продукты не подобрать */ }
  const base = (env.SITE_BASE || "https://invest.rumberg.ru/").replace(/\/?$/, "/");

  // Память продуктов общая с «5 идеями» — утренние подборки тоже не должны повторяться.
  let recent = [];
  if (env.POST_KV) {
    try { recent = (await env.POST_KV.get("history", "json")) || []; } catch (e) { recent = []; }
  }
  recent = recent.map((r) => (typeof r === "string" ? { id: "", name: r, head: "" } : r));
  const recentIds = recent.map((r) => r.id).filter(Boolean);
  let catText = cat.text;
  if (recentIds.length && catText) {
    const filtered = catText.split("\n").filter((line) => {
      const mm = line.match(/^- \[([\w.\-]+)\]/);
      return !(mm && recentIds.includes(mm[1]));
    }).join("\n");
    if (/^- \[/m.test(filtered)) catText = filtered;
  }

  // Тип пэйоффа дописываем в строку каталога скобками после [id]. Без этого правило
  // «типы не повторяются» невыполнимо: «CALL 100 · Лукойл» и «Защита капитала ·
  // Лукойл» для модели просто два названия. Отсюда же тип читает morningLint.
  const typeOf = new Map();
  for (const p of cat.instr || []) if (p && p.id) typeOf.set(p.id, FI_TYPE_LABEL[p.type] || "структурный продукт");
  for (const o of cat.offers || []) if (o && o.id) typeOf.set(o.id, FI_TYPE_LABEL.primary);
  if (catText) {
    catText = catText.split("\n").map((line) => {
      const mm = line.match(/^- \[([\w.\-]+)\] /);
      return mm && typeOf.has(mm[1]) ? mm[0] + "(" + typeOf.get(mm[1]) + ") " + line.slice(mm[0].length) : line;
    }).join("\n");
  }

  const system = MORNING_SYSTEM +
    (catText ? "\n\n=== АКТУАЛЬНЫЙ КАТАЛОГ (единственный источник продуктов и [id]) ===\n" + catText : "");
  const provider = env.POST_PROVIDER || env.CHAT_PROVIDER || "deepseek";

  // id → строка каталога. Из отфильтрованного каталога: недавние продукты для модели
  // не существуют. Сами строки нужны линту, чтобы сверять цифры в зацепках.
  const idSet = new Map();
  for (const l of catText.split("\n")) {
    const mm = l.match(/^- \[([\w.\-]+)\]/);
    if (mm) idSet.set(mm[1], l);
  }

  // До двух попыток: браку возвращаем конкретный список проблем — модель чинит сама.
  // Это надёжнее «жёстких правил» в промпте: правила она читает, а брак — исправляет.
  let messages = [{ role: "user", content: "СТАТЬЯ АНАЛИТИКА:\n\n" + article.slice(0, 12000) }];
  let parsed = null, problems = [], best = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw = "";
    try {
      // temperature повыше: зацепки должны звучать живо. Факты это не расшатывает —
      // цифры новостей сверяются со статьёй, цифры продуктов — со строкой каталога.
      // Бюджет поднят под long: развёрнутые версии трёх тем — это ещё ~700 токенов.
      // Со старыми 1400 ответ обрезался бы на середине, и ретрай жёг бы попытку.
      raw = await callLLM(provider, system, messages, env,
        { temperature: 0.6, maxTokens: attempt ? 3600 : 2400, model: env.POST_MODEL, json: true });
    } catch (e) {
      // обрезка по max_tokens — единственная ошибка, которую лечит ретрай: даём больший
      // бюджет и просим короче (без этого фидбек «верни JSON» бил мимо настоящей причины)
      if (attempt === 0 && /upstream_length/.test(String((e && e.message) || e))) {
        messages = messages.concat([{ role: "user",
          content: "Твой прошлый ответ обрезался лимитом. Сократи text каждого блока до 250 знаков, hook — до 120, и верни JSON целиком." }]);
        continue;
      }
      if (best) break;                          // первая попытка была пригодной — берём её
      throw e;
    }
    parsed = parseMorningJson(raw);
    problems = morningLint(parsed, idSet, article);
    // помним лучшую попытку: вторая может выйти ХУЖЕ первой или вовсе не распарситься
    if (parsed && (!best || problems.length < best.problems.length)) best = { parsed, problems };
    if (!problems.length) break;
    if (attempt === 0) {
      messages = messages.concat([
        { role: "assistant", content: raw || "{}" },   // пустой content ломал бы ретрай-диалог
        { role: "user", content: "Брак. Исправь и верни JSON ЦЕЛИКОМ по той же схеме:\n- " + problems.join("\n- ") },
      ]);
    }
  }
  if (best) { parsed = best.parsed; problems = best.problems; }
  if (!parsed || !Array.isArray(parsed.news) || !Array.isArray(parsed.products)) {
    throw new Error("модель не вернула валидный JSON после двух попыток");
  }

  // Флаг ставим ПО СЛОТУ схемы (мир/США/РФ) — перепутанные флаги рендер чинит сам;
  // блоки-заглушки «тема не покрыта» отфильтровываем: их в посте быть не должно.
  const blocks = parsed.news.slice(0, 3)
    .map((b, i) => (b && typeof b.title === "string" && b.title.trim() && typeof b.text === "string" && b.text.trim())
      ? { flag: MORNING_FLAGS[i], title: b.title.trim().replace(/\.$/, ""), text: b.text.trim(),
          long: morningLong(b), stub: isMorningStub(b) }
      : null)
    .filter((b) => b && !b.stub);
  if (!blocks.length) throw new Error("статья не покрывает ни одной из тем поста");

  const ideas = [];
  const usedTypes = new Map();      // тип пэйоффа → сколько раз уже взят
  let collision = 0;                // израсходовано ли единственное допустимое совпадение
  for (const pr of parsed.products.slice(0, 5)) {
    if (!pr || typeof pr.id !== "string" || typeof pr.hook !== "string" || !pr.hook.trim()) continue;
    // жёстко: только id из отфильтрованного каталога (запрет недавних) и без дублей
    if (!idSet.has(pr.id) || ideas.some((x) => x.id === pr.id)) continue;
    // Правило типов держим и кодом: линт с ретраем модель обычно исправляет, но если
    // она настояла на трёх варрантах — режем здесь, иначе правило держится на честном
    // слове. Пропущенную позицию добираем ниже продуктом нового типа.
    const ty = typeOf.get(pr.id) || "";
    if (ty) {
      const n = usedTypes.get(ty) || 0;
      if (n >= 1) { if (collision >= 1) continue; collision++; }
      usedTypes.set(ty, n + 1);
    }
    const off = (cat.offers || []).find((o) => o.id === pr.id);
    const ins = (cat.instr || []).find((p) => p.id === pr.id);
    const head = typeof pr.headline === "string" ? pr.headline.trim() : "";
    const it = { id: pr.id, head, body: pr.hook.trim() };
    if (off) ideas.push({ ...it, prodUrl: base + "offerings.html#" + off.id, prodName: off.name });
    else if (ins) ideas.push({ ...it, prodUrl: base + "instrument.html?id=" + ins.id, prodName: ins.name });
  }
  if (ideas.length < 2) throw new Error("модель не подобрала продукты из каталога");

  // Добор до пяти, если модель дала меньше или её выбор порезало правилом типов.
  // Берём только НОВЫЕ типы и подставляем нейтральную фразу без цифр: код не знает
  // темы дня, а выдуманная цифра в посте — худшее, что может случиться.
  const filled = [];
  if (ideas.length < 5) {
    const pool = (cat.instr || []).filter((p) => p && p.id)
      .map((p) => ({ id: p.id, name: p.name || p.id, url: base + "instrument.html?id=" + p.id }))
      .concat((cat.offers || []).filter((o) => o && o.id)
        .map((o) => ({ id: o.id, name: o.name || o.id, url: base + "offerings.html#" + o.id })));
    for (const r of pool) {
      if (ideas.length >= 5) break;
      if (!idSet.has(r.id) || ideas.some((x) => x.id === r.id)) continue;
      const ty = typeOf.get(r.id) || "";
      if (!ty || usedTypes.has(ty)) continue;
      usedTypes.set(ty, 1);
      ideas.push({ id: r.id, head: "", body: MORNING_HOOK_FALLBACK, prodUrl: r.url, prodName: r.name });
      filled.push(r.name);
    }
  }

  // Дедуп-память и отметка «сегодня пост собран» (для напоминалки в cron)
  if (env.POST_KV) {
    try {
      const fresh = ideas.map((it) => ({ id: it.id, name: it.prodName || "?",
        head: (it.head || it.body).replace(/\*\*/g, "").slice(0, 80) }));
      await env.POST_KV.put("history", JSON.stringify(fresh.concat(recent).slice(0, 15)));
      const d = mskDate();
      await env.POST_KV.put("morning:" + d.key, "1", { expirationTtl: 172800 });
      // Сжатые новости — в память для AI-консьержа на сайте (см. morningContext):
      // агент отвечает «что сегодня на рынке» по свежей аналитике, а не общими фразами.
      const newsText = blocks.map((b) => b.flag + " " + b.title + " — " + b.text).join("\n");
      await env.POST_KV.put("morning:latest", JSON.stringify({ d: d.key, h: d.human, news: newsText }),
        { expirationTtl: 259200 });
    } catch (e) { /* память необязательна */ }
  }
  // problems после ретрая — мягкие остатки: пост отправляем, сейлзу — предупреждение.
  // Flag-огрехи рендер уже починил по слоту — из предупреждения их убираем.
  const warn = problems.filter((s) => !/flag должен быть/.test(s));
  // Добор кодом виден в посте (нейтральная фраза вместо зацепки) — не молчим о нём
  if (filled.length) {
    warn.push("до пяти идей добрано кодом (" + filled.join(", ") +
      ") — модель не дала пять непересекающихся по типу, у этих позиций общая фраза без цифр");
  }
  return { blocks, ideas, warn };
}

// Рыночный контекст для /chat: сжатый утренний обзор из KV, не старше 3 дней
// (выходные переживает, залежалый не подсовываем). Кэш 5 минут в изоляте — как каталог.
let MORNING_CTX = { at: 0, val: null };
async function morningContext(env) {
  const now = Date.now();
  if (now - MORNING_CTX.at < 5 * 60 * 1000) return MORNING_CTX.val;
  let val = null;
  if (env.POST_KV) {
    try {
      const raw = await env.POST_KV.get("morning:latest", "json");
      if (raw && raw.d && raw.news) {
        const age = (Date.parse(mskDate().key) - Date.parse(raw.d)) / 86400000;
        if (age >= 0 && age <= 3) val = { label: "утренний обзор от " + (raw.h || raw.d), news: raw.news };
      }
    } catch (e) { /* контекст необязателен */ }
  }
  MORNING_CTX = { at: now, val };
  return val;
}

// Готовый пост возвращается ТОМУ, КТО ПРИСЛАЛ статью (chatId) — сейлз сам публикует
// в канал, Руслан в цепочке не участвует. Без chatId (прямой вызов) — Руслану.
async function sendMorningDraft(env, article, chatId) {
  const to = chatId || env.ADMIN_CHAT_ID;
  if (!to) return;
  // Статью помним сутки: кнопка «🔁 Пересобрать» работает без повторной отправки текста
  if (env.POST_KV) {
    try { await env.POST_KV.put("morning:article:" + to, article, { expirationTtl: 86400 }); } catch (e) {}
  }
  let res;
  try {
    res = await generateMorning(env, article);
  } catch (e) {
    await tg(env, "sendMessage", { chat_id: to,
      text: "⚠️ Утренний пост не собрался: " + String((e && e.message) || e).slice(0, 200) +
            "\nПришлите статью ещё раз — попробую заново." });
    return;
  }
  // Новостной блок: тезис-заголовок ВНЕ цитаты («🌍 Мир хрупок»), текст — в <blockquote>
  // под ним. Модель отдаёт СТРУКТУРУ (JSON), вся вёрстка — здесь, кодом.
  const newsHtml = res.blocks.map((b) =>
    b.flag + " <b>" + esc(b.title) + "</b>\n<blockquote>" + postToTgHtml(b.text) + "</blockquote>"
  ).join("\n\n");

  // Продукт: свой заголовок жирным → зацепка → название-ссылка каптионом. Заголовок
  // продаёт, название только опознаёт — если заголовка нет, ссылка выходит наверх.
  const nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
  const lines = res.ideas.slice(0, 5).map((it, i) => {
    const link = '<a href="' + it.prodUrl + '">' + esc(it.prodName) + " →</a>";
    return it.head
      ? nums[i] + " <b>" + esc(it.head) + "</b>\n" + postToTgHtml(it.body) + "\n" + link
      : nums[i] + " " + link + "\n" + postToTgHtml(it.body);
  });

  // Превью выключено: в подборке 5 продуктов, а карточка была бы одна — перекашивает
  // внимание к первому (пробовали, откатили по решению Руслана 04.08.2026).
  const preview = { is_disabled: true };

  const text = "☕️ <b>Утро на рынках</b> · " + esc(mskDate().human) + "\n\n" +
    newsHtml +
    "\n\n💡 <b>Что предложить клиенту сегодня</b>\n\n" + lines.join("\n\n") +
    "\n\n<i>" + esc(POST_DISCLAIMER) + "</i>";
  // Готовый HTML поста — в KV: кнопка «📢 В канал» публикует его сервером с выключенным
  // превью. Копипаста превью НЕ выключает (клиент строит его заново) — потому и кнопка.
  if (env.POST_KV) {
    try { await env.POST_KV.put("morning:post:" + to, text, { expirationTtl: 86400 }); } catch (e) {}
  }
  // Тот же пост в виде данных для главной. Новости и продукты кладём ДВУМЯ
  // независимыми списками — ровно так их и собирает конвейер. Пары «новость №1 —
  // продукт №1» не существует, и на витрине её изображать нельзя.
  // Ссылка на полный разбор пока не проставляется: разборы заводятся руками.
  if (env.POST_KV) {
    const d = mskDate();
    // Разбор и короткая новость — из ОДНОГО блока: title общий, lead — короткая
    // версия, body — развёрнутая. Расходиться им негде, это один проход модели.
    const items = res.blocks.slice(0, 3).map((b) => ({
      id: d.key + "-" + (MORNING_SLOTS[b.flag] || "x"),
      date: d.key,
      rubric: MORNING_RUBRICS[b.flag] || "",
      title: b.title,
      lead: b.text,
      body: (b.long && b.long.length) ? b.long : [b.text],
    }));
    const siteNews = items.map((it) => ({
      rubric: it.rubric, title: it.title, body: it.lead,
      // заголовок новости на главной ведёт в свой разбор — адрес известен заранее
      link: "research.html?i=" + d.key + "#" + it.id,
    }));
    const siteProducts = res.ideas.slice(0, 5).map((it) => it && it.id).filter(Boolean);
    const issue = {
      id: d.key, date: d.key, label: d.human + " " + d.key.slice(0, 4),
      summary: items.map((it) => it.title).join(" · "),
      items,
      // те же пять продуктов, что и на главной, с зацепкой из поста
      products: res.ideas.slice(0, 5).map((it) => ({ id: it.id, why: it.body })),
    };
    // date — ключ ДАТЫ (mskDate().key). Поля .iso у mskDate нет: стояло оно, JSON.stringify
    // молча выбрасывал undefined, файл уезжал без даты, а главная без даты считает возраст
    // обзора неизвестным и прячет новости, оставляя одни продукты. Ровно так и вышло 17.08.
    const sitePayload = JSON.stringify({
      morning: { date: d.key, news: siteNews, products: siteProducts },
      research: issue,
    });
    try { await env.POST_KV.put("morning:site:" + to, sitePayload, { expirationTtl: 86400 }); } catch (e) {}
  }

  const buttons = [{ text: "🔁 Пересобрать", callback_data: "morn" }];
  if (env.CHANNEL_ID) buttons.push({ text: "📢 В канал", callback_data: "mpub" });
  // Публикация на витрину: коммит data/morning.js через GitHub API — тот же путь,
  // которым админка правит остальные data-файлы.
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) buttons.push({ text: "🌐 На сайт", callback_data: "msite" });
  const resp = await tg(env, "sendMessage", { chat_id: to, text, parse_mode: "HTML",
    link_preview_options: preview,
    reply_markup: { inline_keyboard: [buttons] } });
  // Пост привязываем к КОНКРЕТНОМУ сообщению: иначе после «Пересобрать» кнопка «В канал»
  // на старом пузыре публиковала бы новейшую версию из общего ключа
  if (env.POST_KV) {
    try {
      const rj = await resp.json();
      const mid = rj && rj.ok && rj.result && rj.result.message_id;
      if (mid != null) {
        await env.POST_KV.put("morning:post:" + to + ":" + mid, text, { expirationTtl: 86400 });
        // Данные для сайта привязываем к тому же сообщению и по той же причине:
        // «На сайт» на старом пузыре не должна выкладывать пересобранную версию
        const sp = await env.POST_KV.get("morning:site:" + to);
        if (sp) await env.POST_KV.put("morning:site:" + to + ":" + mid, sp, { expirationTtl: 86400 });
      }
    } catch (e) { /* привязка — best effort, общий ключ уже записан */ }
  }
  if (res.warn.length) {
    await tg(env, "sendMessage", { chat_id: to, parse_mode: "HTML",
      text: "⚠️ <b>Проверьте перед публикацией</b> — модель не всё исправила даже со второй попытки:\n• " +
            res.warn.map(esc).join("\n• ") });
  }
}

// Cron (будни 10:00 МСК): статья уже пришла → молчим; нет → напоминаем сейлзам
// из ANALYST_CHAT_ID (они шлют статью); если список пуст — Руслану.
async function morningCron(env) {
  const targets = String(env.ANALYST_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!targets.length && env.ADMIN_CHAT_ID) targets.push(String(env.ADMIN_CHAT_ID));
  if (!targets.length) return;
  let done = null;
  if (env.POST_KV) { try { done = await env.POST_KV.get("morning:" + mskDate().key); } catch (e) {} }
  if (done) return;
  for (const id of targets) {
    await tg(env, "sendMessage", { chat_id: id,
      text: "☕️ Утренней статьи сегодня ещё не было. Пришлите текст обзора боту — соберу пост с продуктами." });
  }
}

// Markdown модели → Telegram HTML. Сначала экранируем весь текст (модель может вернуть
// случайные < > &), затем разворачиваем **жирный** и [текст](https://url) в теги.
function postToTgHtml(s) {
  let out = esc(String(s || "").trim());
  out = out.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

async function generatePost(env, theme) {
  let cat = { text: "", instr: [], offers: [], ideas: [] };
  try { cat = await buildCatalog(env); } catch (e) { /* каталог необязателен, но лучше с ним */ }
  const base = (env.SITE_BASE || "https://invest.rumberg.ru/").replace(/\/?$/, "/");
  const group = env.TG_GROUP_URL || "https://t.me/+NHbVOoUI5IBkN2Uy";

  // Память последних идей (чтобы не повторяться). Хранится в KV-биндинге POST_KV;
  // если биндинга нет — просто работаем без дедупликации.
  let recent = [];
  if (env.POST_KV) {
    try { recent = (await env.POST_KV.get("history", "json")) || []; } catch (e) { recent = []; }
  }
  // Поддержка старого формата (строки) и нового (объекты {id,name,head}).
  recent = recent.map((r) => (typeof r === "string" ? { id: "", name: r, head: "" } : r));
  const recentIds = recent.map((r) => r.id).filter(Boolean);

  // Детерминированная дедупликация: убираем недавние продукты ПРЯМО из каталога —
  // тогда модель физически не сможет их выбрать (надёжнее, чем просить «не повторяй»).
  let catText = cat.text;
  if (recentIds.length && catText) {
    const filtered = catText.split("\n").filter((line) => {
      const mm = line.match(/^- \[([\w.\-]+)\]/);
      return !(mm && recentIds.includes(mm[1]));
    }).join("\n");
    if (/^- \[/m.test(filtered)) catText = filtered; // не оставляем каталог пустым
  }
  const avoid = recent.length
    ? "\n\n=== УЖЕ ПРЕДЛАГАЛИ НЕДАВНО (возьми ДРУГИЕ продукты и другие формулировки) ===\n" +
      recent.map((r) => "- " + (r.name || "?") + (r.head ? " — " + r.head : "")).join("\n")
    : "";

  const system = POST_SYSTEM +
    (catText ? "\n\n=== АКТУАЛЬНЫЙ КАТАЛОГ (единственный источник продуктов, цифр и идентификаторов [id]) ===\n" + catText : "") +
    avoid;
  const user = "Дай 5 коротких идей постов по правилам выше." +
    (theme ? " По возможности вокруг темы: " + theme + "." :
             " Сам выбери 5 разных продуктов из каталога и уместные обобщённые зацепки.");
  const provider = env.POST_PROVIDER || env.CHAT_PROVIDER || "deepseek";
  const raw = await callLLM(provider, system, [{ role: "user", content: user }], env,
    { temperature: 0.85, maxTokens: 1100, model: env.POST_MODEL });

  // Разбираем ответ на блоки «[id] + текст». Ссылку строим сами по id — не полагаемся
  // на модель (она ссылки часто игнорирует/выдумывает).
  const ideas = [];
  const re = /\[([\w.\-]+)\]\s*([\s\S]*?)(?=\n\s*\[[\w.\-]+\]|$)/g;
  let m;
  while ((m = re.exec(raw || "")) !== null) {
    const id = m[1];
    const body = (m[2] || "").trim();
    if (!body) continue;
    let prodUrl = "", prodName = "";
    const off = (cat.offers || []).find((o) => o.id === id);
    const ins = (cat.instr || []).find((p) => p.id === id);
    if (off) { prodUrl = base + "offerings.html#" + off.id; prodName = off.name; }
    else if (ins) { prodUrl = base + "instrument.html?id=" + ins.id; prodName = ins.name; }
    ideas.push({ id, body, prodUrl, prodName });
  }
  // Фолбэк: модель не разметила [id] — отдаём весь текст одной идеей без ссылки.
  if (!ideas.length && raw && raw.trim()) ideas.push({ body: raw.trim(), prodUrl: "", prodName: "" });

  // Записываем свежие идеи в память (последние ~9 = ≈3 запуска), чтобы не повторяться.
  if (env.POST_KV && ideas.length) {
    try {
      const fresh = ideas.map((it) => ({
        id: it.id || "",
        name: it.prodName || "?",
        head: ((it.body.split("\n")[0] || "").replace(/\*\*/g, "").trim()).slice(0, 80),
      }));
      await env.POST_KV.put("history", JSON.stringify(fresh.concat(recent).slice(0, 15)));
    } catch (e) { /* память необязательна */ }
  }
  return { ideas, group };
}

async function sendPostDraft(env, theme) {
  if (!env.ADMIN_CHAT_ID) return;
  let res;
  try {
    res = await generatePost(env, theme);
  } catch (e) {
    await tg(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID,
      text: "⚠️ Не удалось сгенерировать идеи: " + String((e && e.message) || e).slice(0, 200) });
    return;
  }
  if (!res || !res.ideas.length) {
    await tg(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, text: "⚠️ Пустой ответ модели, идеи не сформированы." });
    return;
  }
  const provider = env.POST_PROVIDER || env.CHAT_PROVIDER || "deepseek";
  const nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
  const blocks = res.ideas.map((it, i) => {
    let b = (nums[i] || (i + 1) + ".") + " " + postToTgHtml(it.body);
    if (it.prodUrl) b += '\n🔗 <a href="' + it.prodUrl + '">' + esc(it.prodName || "Смотреть на сайте") + "</a>";
    return b;
  });
  const memWarn = env.POST_KV ? "" : "\n\n⚠️ <i>Память не подключена (KV POST_KV) — идеи могут повторяться.</i>";
  const text = "📝 <b>Идеи для канала</b> (" + res.ideas.length + ") · " + esc(provider) + " · выбери и опубликуй\n\n" +
    blocks.join("\n\n") +
    '\n\n💬 <a href="' + res.group + '">Telegram-группа</a>' +
    "\n\n<i>" + esc(POST_DISCLAIMER) + "</i>" + memWarn;
  await tg(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true });
}

// ============================================================================
// Пост для финансовых институтов (/fi): 5 непересекающихся продуктов
// ============================================================================
// Чем отличается от «5 идей» и утреннего поста: аудитория — банки, брокеры, УК,
// НПФ; тон деловой, без эмодзи-заголовков и продающих зацепок. Пост — ТИЗЕР
// (решение 10.08.2026): название-ссылка и одна фраза «какой риск берётся», без
// строки параметров — за цифрами читатель идёт на сайт. Параметры при этом
// собраны кодом из объекта продукта (fiSpec/fiSpecOffer) и живут в КАТАЛОГЕ для
// модели, они же — эталон сверки: fiLint проверяет каждое число фразы по
// параметрам именно этого продукта, выдумать цифру модель не может. Фраза
// забракована — её заменяет типовой фолбэк, продукт из подборки не выпадает.

const FI_TYPE_LABEL = {
  warrant: "варрант", discount: "дисконтная облигация", protection: "защита капитала",
  autocall: "автоколл", booster: "бустер", primary: "биржевой выпуск",
};

// «12.5» → «12,5»: в посте по-русски, и заодно срезает хвосты float-арифметики
const fiNum = (n) => String(Math.round(Number(n) * 100) / 100).replace(".", ",");
const fiMoney = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Запасная фраза по типу — когда модель не дала пригодной (брак дважды, выдуманные
// числа): фраза теперь единственный текст под ссылкой, голая ссылка выглядит обрывком.
// Механика типа без конкретных цифр — соврать нечем.
const FI_WHY_FALLBACK = {
  warrant: "Участие в росте базового актива; риск ограничен уплаченной премией.",
  discount: "Покупка ниже номинала с погашением по 100% — кредитный риск эмитента в чистом виде.",
  protection: "Защита капитала с участием в росте базового актива.",
  autocall: "Регулярный купон при умеренных просадках корзины; автоотзыв закрывает позицию досрочно.",
  booster: "Ускоренное участие в росте в заданном диапазоне; при снижении — динамика самой бумаги.",
  primary: "Биржевой выпуск: покупается в стакане, как обычная облигация.",
};
const fiHas = (name, part) => String(name || "").toLowerCase().includes(String(part || "").toLowerCase());
// «·» — разделитель параметров в строке, поэтому внутри самого параметра его быть не
// должно: «Биржа · стакан» из данных иначе читается как два отдельных параметра.
const fiFlat = (s) => String(s == null ? "" : s).replace(/\s*·\s*/g, ", ").trim();

// Параметры продукта доски — то же, что в паспорте на сайте, но одной строкой.
// Состав подобран под ФИ: не «за что платит инвестор», а чем ограничен риск.
function fiSpec(p) {
  const s = [], K = p.strike, K2 = p.strike2;
  if (p.type === "warrant") {
    s.push(p.structure === "cs" ? "колл-спред" : "CALL-варрант");
    if (p.quote != null) s.push("премия " + fiNum(p.quote) + "% номинала");
    if (K != null) s.push("страйк " + fiNum(K) + "%" + (K2 ? ", потолок " + fiNum(K2) + "%" : ""));
    if (K != null && K2) s.push("выплата не выше " + fiNum(K2 - K) + "% номинала");
    if (K != null && p.quote != null) s.push("безубыток " + fiNum(K + p.quote) + "%");
  } else if (p.type === "discount") {
    if (p.quote != null) s.push("вход " + fiNum(p.quote) + "% номинала");
    s.push("погашение 100%", "без купонов");
  } else if (p.type === "protection") {
    s.push("вход 100% номинала");
    s.push("защита " + fiNum(p.protectionPct != null ? p.protectionPct : 100) + "%");
    s.push("участие " + fiNum(Math.round((p.participation || 1) * 100)) + "%" +
      (K > 100 ? " выше " + fiNum(K) + "%" : ""));
  } else if (p.type === "autocall") {
    s.push("вход 100% номинала");
    if (p.couponPa != null) s.push("купон " + fiNum(p.couponPa) + "% годовых");
    if (p.couponBarrier != null) s.push("барьер купона " + fiNum(p.couponBarrier) + "%");
    if (p.callBarrier != null) s.push("автоотзыв " + fiNum(p.callBarrier) + "%");
    if (p.protectionPct != null) s.push("защита " + fiNum(p.protectionPct) + "%");
    if (Array.isArray(p.basket) && p.basket.length) s.push("worst-of " + p.basket.length);
  } else if (p.type === "booster") {
    s.push("вход 100% номинала");
    if (p.ku != null && K != null && K2 != null) {
      s.push("коэффициент " + fiNum(p.ku) + "% в диапазоне " + fiNum(K) + "–" + fiNum(K2) + "%");
      s.push("максимум " + fiNum(K + (p.ku / 100) * (K2 - K)) + "% номинала");
    }
    if (K != null) s.push("ниже " + fiNum(K) + "% — как базовый актив");
  }
  return s;
}

// Первичка/биржевые выпуски: цену входа НЕ додумываем — у торгующегося выпуска она
// рыночная, а у размещаемого её в данных может не быть. Берём только то, что есть.
function fiSpecOffer(o) {
  const s = [];
  if (o.kind) s.push(fiFlat(o.kind));
  if (o.price != null) s.push("цена " + fiNum(o.price) + "% номинала");
  if (o.participation && !/участ/i.test(String(o.kind || ""))) s.push("участие " + fiFlat(o.participation));
  if (o.nominal != null) s.push("номинал " + fiMoney(o.nominal) + " ₽");
  if (o.isin) s.push("ISIN " + o.isin);
  if (o.venue) s.push(fiFlat(o.venue));
  if (o.statusLabel) s.push(fiFlat(o.statusLabel));
  return s;
}

// Каталог доски + первичка в едином виде: три оси непересечения (тип, класс актива,
// базовый актив), готовая строка параметров и ссылка. Одни и те же записи уходят
// и в промпт, и в рендер — значит, модель видит ровно те цифры, что будут в посте.
function fiPool(cat, base) {
  const out = [];
  const add = (r) => {
    const bits = [];
    // Актив пишем, только если названия недостаточно. Сравниваем без тикера в скобках:
    // «Защита капитала · S&P 500» и «S&P 500 (SPY)» — это одно и то же, повтор лишний.
    const bare = String(r.under || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (r.under && !fiHas(r.name, bare)) bits.push(fiFlat(r.under));
    bits.push.apply(bits, r.spec);
    if (r.tenor && !fiHas(r.name, r.tenor)) bits.push("срок " + r.tenor);
    if (r.ccy) bits.push(fiFlat(r.ccy));
    r.specText = bits.filter(Boolean).join(" · ");
    if (r.specText) out.push(r);
  };
  for (const p of cat.instr || []) {
    if (!p || !p.id) continue;
    // расчёты в рублях при валютном номинале — для ФИ это первый вопрос
    const ccy = p.settle && p.settle !== p.currency
      ? p.currency + ", расчёты в " + (p.settle === "RUB" ? "₽" : p.settle)
      : (p.currency && p.currency !== "RUB" ? p.currency : "");
    add({
      id: p.id, name: p.name || p.id, type: p.type || "warrant",
      typeLabel: FI_TYPE_LABEL[p.type] || "структурный продукт",
      cls: p.cls || "Прочее", under: p.underlying || "", tenor: p.tenor || "",
      ccy, spec: fiSpec(p),
      url: base + "instrument.html?id=" + p.id,
    });
  }
  for (const o of cat.offers || []) {
    if (!o || !o.id) continue;
    // Биржевые выпуски — свой класс: бумага в стакане не конкурирует с внебиржевой
    // структурой на тот же актив, но и дублировать её в подборке незачем.
    add({
      id: o.id, name: o.name || o.id, type: "primary", typeLabel: "биржевой выпуск",
      cls: "Биржевые выпуски", under: o.reference || "", tenor: o.tenor || "",
      ccy: o.fx || "", spec: fiSpecOffer(o),
      url: base + "offerings.html#" + o.id,
    });
  }
  return out;
}

const fiKey = (r) => String(r.under || r.name).toLowerCase();

// Существует ли вообще пятёрка без пересечений по типу/классу/активу — и какая.
// Перебор с возвратом: пул ~50 позиций, глубина 5, отсечка по трём осям — мгновенно.
// Нужен дважды: проверить, что каталог после дедупа ещё собирается, и как запасной
// вариант, если модель дважды промахнулась мимо правил (пост уйдёт в любом случае).
function fiPick(list) {
  const res = [], used = { type: new Set(), cls: new Set(), under: new Set() };
  const go = (from) => {
    if (res.length === 5) return true;
    for (let j = from; j < list.length; j++) {
      const r = list[j];
      if (used.type.has(r.type) || used.cls.has(r.cls) || used.under.has(fiKey(r))) continue;
      used.type.add(r.type); used.cls.add(r.cls); used.under.add(fiKey(r)); res.push(r);
      if (go(j + 1)) return true;
      res.pop(); used.type.delete(r.type); used.cls.delete(r.cls); used.under.delete(fiKey(r));
    }
    return false;
  };
  return go(0) ? res.slice() : null;
}

// Дополнить УЖЕ выбранные позиции до пяти. Жадный добор здесь заводил в тупик:
// типов всего шесть, и редкие (бустер, биржевой выпуск, дисконт, автоколл) заперты
// каждый в своём классе активов. Замер 21.08.2026 на каталоге из 107 позиций:
// 90 позиций из 107 в одиночку делают пятёрку недостижимой, 57% допустимых пар —
// тоже. То есть отказ «не удалось собрать 5» возникал при живом каталоге, в котором
// пятёрка есть. Перебор с возвратом находит её, если она существует.
function fiComplete(prefix, list) {
  const used = { type: new Set(), cls: new Set(), under: new Set() };
  for (const r of prefix) { used.type.add(r.type); used.cls.add(r.cls); used.under.add(fiKey(r)); }
  const res = prefix.slice();
  const go = (from) => {
    if (res.length === 5) return true;
    for (let j = from; j < list.length; j++) {
      const r = list[j];
      if (used.type.has(r.type) || used.cls.has(r.cls) || used.under.has(fiKey(r))) continue;
      used.type.add(r.type); used.cls.add(r.cls); used.under.add(fiKey(r)); res.push(r);
      if (go(j + 1)) return true;
      res.pop(); used.type.delete(r.type); used.cls.delete(r.cls); used.under.delete(fiKey(r));
    }
    return false;
  };
  return go(0) ? res : null;
}

// Числа во фразе модели, которых нет в параметрах продукта. В отличие от утреннего
// поста проверяем ЛЮБЫЕ числа, а не только трёхзначные: перепутать 68% и 80% в цене
// входа опаснее всего, а оба коротких.
function fiAlienNumbers(text, src) {
  const norm = (s) => String(s).replace(/\./g, ",").replace(/(\d)[  ]+(?=\d)/g, "$1");
  const s = norm(src), out = [];
  for (const m of norm(text).matchAll(/\d+(?:,\d+)?/g)) if (!s.includes(m[0])) out.push(m[0]);
  return [...new Set(out)];
}

const FI_SYSTEM = `Ты — аналитик компании Rumberg. Готовишь короткую подборку структурных продуктов для ФИНАНСОВЫХ ИНСТИТУТОВ: банки, брокеры, управляющие компании, НПФ. Читатель — профессионал. Ему нужны структура и параметры, а не продающие лозунги.

Ответь ОДНИМ валидным JSON-объектом без текста вокруг, строго по схеме:
{"products":[
  {"id":"<id из каталога>","why":"<одна фраза до 110 знаков: какой риск берёт на себя инвестор и под какую задачу бумага>"},
  ... ровно 5 объектов
]}

ЖЁСТКИЕ ПРАВИЛА (нарушение = брак):
- Ровно 5 продуктов, и они НЕ ПЕРЕСЕКАЮТСЯ между собой: у всех пяти РАЗНЫЙ тип, РАЗНЫЙ класс актива и РАЗНЫЙ базовый актив. Два варранта, две бумаги на ОФЗ или два продукта на акции США в одной подборке — брак. Тип и класс указаны в начале каждой строки каталога.
- id бери ТОЛЬКО из [квадратных скобок] в каталоге.
- why — одна фраза без воды и без эпитетов («уникальный», «интересный», «отличный»). По сути: какой риск берётся и для какой задачи бумага годится. Без эмодзи, без восклицаний, без обращения к читателю.
- В посте под названием-ссылкой будет ТОЛЬКО твоя фраза: параметры система не печатает, за деталями читатель идёт по ссылке. Поэтому не пересказывай параметры списком — максимум ОДНА ключевая цифра (защита, купон или участие), и она обязана быть в строке каталога ИМЕННО этого продукта.
- Ты НЕ знаешь свежих новостей, курсов и решений ЦБ. Не ссылайся на события и не описывай состояние рынка.
- Запрещено: обещания доходности, формулировки «X% годовых» как доходности, слова «нота», «гарантированный», «надёжный», индивидуальные инвестрекомендации, внутренние id и календарные даты.
- Дисклеймер не добавляй — его добавит система.

Пример ФОРМЫ и ТОНА (содержание всегда из каталога):
{"products":[{"id":"AAA-1","why":"Кредитный риск госкорпорации без процентного риска купона — для портфеля под фиксированный горизонт."},{"id":"BBB-2","why":"Ограниченный премией риск на длинную дюрацию: убыток известен заранее, рост не ограничен."}]}`;

function fiLint(p, byId) {
  if (!p || typeof p !== "object") return ["ответ не является JSON-объектом — верни один объект по схеме"];
  const probs = [];
  const arr = Array.isArray(p.products) ? p.products : [];
  if (arr.length !== 5) probs.push("в products должно быть ровно 5 позиций (сейчас " + arr.length + ")");
  const seenId = new Set(), byType = new Map(), byCls = new Map(), byUnder = new Map();
  arr.slice(0, 5).forEach((it, i) => {
    const n = "products[" + (i + 1) + "]";
    if (!it || typeof it.id !== "string" || typeof it.why !== "string" || !it.why.trim()) {
      probs.push(n + ": нужны id и why"); return;
    }
    const r = byId.get(it.id);
    if (!r) { probs.push(n + ": id «" + it.id + "» нет в каталоге — возьми id из [скобок]"); return; }
    if (seenId.has(it.id)) probs.push(n + ": продукт повторяется — нужны 5 разных");
    seenId.add(it.id);
    // три оси непересечения: сообщаем, ЧЕМ именно занято — модель чинит адресно
    if (byType.has(r.type)) probs.push(n + ": тип «" + r.typeLabel + "» уже занят продуктом «" + byType.get(r.type) + "» — возьми продукт другого типа");
    else byType.set(r.type, r.name);
    if (byCls.has(r.cls)) probs.push(n + ": класс актива «" + r.cls + "» уже занят продуктом «" + byCls.get(r.cls) + "» — возьми другой класс");
    else byCls.set(r.cls, r.name);
    if (byUnder.has(fiKey(r))) probs.push(n + ": базовый актив «" + (r.under || r.name) + "» уже занят продуктом «" + byUnder.get(fiKey(r)) + "» — возьми другой актив");
    else byUnder.set(fiKey(r), r.name);

    const why = it.why.trim();
    if (why.length > 130) probs.push(n + ": why длиннее 110 знаков (" + why.length + ") — сожми до одной фразы");
    // Границу слова у «нота» ставим кириллическими lookaround-ами: \b считает буквой
    // только латиницу, поэтому /нота\b/ по русскому тексту НЕ срабатывает.
    const bad = why.match(/(?<![а-яё])нот[ауыеой]?(?![а-яё])|гарантирован|надёжн|надежн|% годовых|доходность/i);
    if (bad) probs.push(n + ": формулировка «" + bad[0] + "» в why запрещена — перепиши фразу без неё");
    if (/\p{Extended_Pictographic}|!/u.test(why)) probs.push(n + ": в why эмодзи или восклицательный знак — тон должен быть деловым");
    const alien = fiAlienNumbers(why, r.name + " · " + r.specText);
    if (alien.length) probs.push(n + ": чисел " + alien.join(", ") + " нет в параметрах этого продукта — числа можно брать только из строки каталога ИМЕННО этого продукта");
    // фраза — единственный текст поста: перечисление цифр превращает её обратно
    // в строку параметров, которую мы из поста убрали
    const digits = why.match(/\d+(?:[.,]\d+)?/g) || [];
    if (digits.length > 2) probs.push(n + ": во фразе " + digits.length + " чисел — это пересказ параметров, оставь одну ключевую цифру");
  });
  return probs;
}

async function generateFi(env, theme) {
  const cat = await buildCatalog(env);
  const base = (env.SITE_BASE || "https://invest.rumberg.ru/").replace(/\/?$/, "/");
  const pool = fiPool(cat, base);
  if (!fiPick(pool)) throw new Error("в каталоге не набирается 5 непересекающихся продуктов");

  // Память своя (fi:history), не общая с каналом агентов: аудитории разные, один и тот
  // же продукт может уйти и туда, и туда. Дедуп нужен только между подборками для ФИ.
  let recent = [];
  if (env.POST_KV) { try { recent = (await env.POST_KV.get("fi:history", "json")) || []; } catch (e) { recent = []; } }
  const recentIds = recent.map((r) => r && r.id).filter(Boolean);
  // Недавние вычёркиваем ЖЁСТКО — но только пока остаток каталога ещё собирается
  // в пятёрку по всем трём осям, иначе подборка не соберётся вовсе.
  let avail = pool.filter((r) => !recentIds.includes(r.id));
  if (!fiPick(avail)) avail = pool;

  const byId = new Map(avail.map((r) => [r.id, r]));
  const catText = avail.map((r) => "- [" + r.id + "] тип: " + r.typeLabel + " · класс: " + r.cls +
    " · " + r.name + " · " + r.specText).join("\n");
  const system = FI_SYSTEM + "\n\n=== КАТАЛОГ (единственный источник продуктов, цифр и [id]) ===\n" + catText;
  const user = "Собери подборку из 5 непересекающихся продуктов по правилам выше." +
    (theme ? " По возможности вокруг темы: " + theme + "." : "");
  const provider = env.POST_PROVIDER || env.CHAT_PROVIDER || "deepseek";

  // Две попытки: браку возвращаем список проблем — модель чинит адресно. Как в
  // утреннем конвейере, помним лучшую попытку: вторая бывает хуже первой.
  let messages = [{ role: "user", content: user }];
  let parsed = null, problems = [], best = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw = "";
    try {
      raw = await callLLM(provider, system, messages, env,
        { temperature: 0.5, maxTokens: attempt ? 1600 : 900, model: env.POST_MODEL, json: true });
    } catch (e) {
      if (attempt === 0 && /upstream_length/.test(String((e && e.message) || e))) {
        messages = messages.concat([{ role: "user",
          content: "Твой прошлый ответ обрезался лимитом. Сократи why до 90 знаков и верни JSON целиком." }]);
        continue;
      }
      if (best) break;
      throw e;
    }
    parsed = parseMorningJson(raw);
    problems = fiLint(parsed, byId);
    if (parsed && (!best || problems.length < best.problems.length)) best = { parsed, problems };
    if (!problems.length) break;
    if (attempt === 0) {
      messages = messages.concat([
        { role: "assistant", content: raw || "{}" },
        { role: "user", content: "Брак. Исправь и верни JSON ЦЕЛИКОМ по той же схеме:\n- " + problems.join("\n- ") },
      ]);
    }
  }
  if (best) { parsed = best.parsed; problems = best.problems; }

  // Собираем пятёрку, отбрасывая позиции, которые нарушают непересечение: лучше
  // взять недостающие кодом, чем выпустить подборку с двумя варрантами на ОФЗ.
  const items = [], used = { type: new Set(), cls: new Set(), under: new Set() };
  for (const pr of (parsed && Array.isArray(parsed.products) ? parsed.products : [])) {
    if (items.length === 5) break;
    if (!pr || typeof pr.id !== "string") continue;
    const r = byId.get(pr.id);
    if (!r || used.type.has(r.type) || used.cls.has(r.cls) || used.under.has(fiKey(r))) continue;
    const why = typeof pr.why === "string" ? pr.why.trim() : "";
    // фразу с выдуманным числом не чиним — заменяем типовым фолбэком: фраза теперь
    // единственный текст под ссылкой, пустой блок выглядит обрывком
    const clean = why && !fiAlienNumbers(why, r.name + " · " + r.specText).length ? why : "";
    used.type.add(r.type); used.cls.add(r.cls); used.under.add(fiKey(r));
    items.push({ ...r, why: clean || FI_WHY_FALLBACK[r.type] || "" });
  }
  // Добор кодом: продукты в подборке важнее комментария к ним. Дополняем перебором,
  // а не жадно. Если выбор модели загнал в тупик — снимаем её последние позиции по
  // одной (первые в ответе она считает лучшими) и пробуем снова; в крайнем случае
  // берём пятёрку целиком кодом. Подборка должна уйти всегда, когда она существует.
  let filled = items.length === 5 ? items : null;
  const kept = items.slice();
  for (let drop = 0; !filled && drop <= kept.length; drop++) {
    filled = fiComplete(kept.slice(0, kept.length - drop), avail);
  }
  if (!filled) filled = fiPick(avail);
  if (!filled || filled.length < 5) throw new Error("не удалось собрать 5 непересекающихся продуктов");
  // Фразы модели сохраняем у тех позиций, которые она сама и выбрала.
  const whyById = new Map(items.map((r) => [r.id, r.why]));
  const out = filled.map((r) => ({ ...r, why: whyById.get(r.id) || FI_WHY_FALLBACK[r.type] || "" }));
  const added = out.length - out.filter((r) => whyById.has(r.id)).length;
  // Честно сообщаем сейлзу, сколько позиций подставил код: у них типовая фраза
  // вместо авторской, и это видно в посте. Молча подменять — обманывать читателя.
  if (added > 0) {
    problems = problems.concat([
      "позиций подставлено кодом: " + added + " (у них общая фраза; модель не дала пятёрку без пересечений)",
    ]);
  }
  items.length = 0;
  items.push.apply(items, out);

  if (env.POST_KV) {
    try {
      const fresh = items.map((r) => ({ id: r.id, name: r.name }));
      await env.POST_KV.put("fi:history", JSON.stringify(fresh.concat(recent).slice(0, 10)));
    } catch (e) { /* память необязательна */ }
  }
  return { items, warn: problems };
}

// Готовая подборка уходит ТОМУ, КТО ВЫЗВАЛ /fi — он сам решает, кому её отправить.
async function sendFiDraft(env, theme, chatId) {
  const to = chatId || env.ADMIN_CHAT_ID;
  if (!to) return;
  // Тему помним сутки: кнопка «🔁 Пересобрать» работает без повторного ввода команды
  if (env.POST_KV) {
    try { await env.POST_KV.put("fi:theme:" + to, String(theme || ""), { expirationTtl: 86400 }); } catch (e) {}
  }
  let res;
  try {
    res = await generateFi(env, theme);
  } catch (e) {
    await tg(env, "sendMessage", { chat_id: to,
      text: "⚠️ Подборка для ФИ не собралась: " + String((e && e.message) || e).slice(0, 200) });
    return;
  }
  // Вёрстка — кодом: название-ссылка жирным, под ним ОДНА фраза. Строку параметров
  // в пост не печатаем (решение 10.08.2026) — пост зовёт на сайт, а не заменяет его;
  // без пригодной фразы модельный текст уже заменён типовым фолбэком в generateFi.
  const nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
  const blocks = res.items.map((r, i) =>
    nums[i] + ' <b><a href="' + r.url + '">' + esc(r.name) + "</a></b>\n" + postToTgHtml(r.why));

  const text = "🏛 <b>Структурные продукты Rumberg</b>\nПодборка для финансовых институтов · " +
    esc(mskDate().human) + "\n\n" + blocks.join("\n\n") +
    "\n\nПараметры и котировки — по ссылкам, индикативно." +
    "\n<i>" + esc(POST_DISCLAIMER) + "</i>";

  if (env.POST_KV) {
    try { await env.POST_KV.put("fi:post:" + to, text, { expirationTtl: 86400 }); } catch (e) {}
  }
  const buttons = [{ text: "🔁 Пересобрать", callback_data: "fi" }];
  // Отдельный канал, НЕ CHANNEL_ID: там сидят агенты, у подборки для ФИ другая аудитория
  if (env.FI_CHANNEL_ID) buttons.push({ text: "📢 В канал ФИ", callback_data: "fipub" });
  const resp = await tg(env, "sendMessage", { chat_id: to, text, parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [buttons] } });
  // Привязка к конкретному сообщению: после «Пересобрать» кнопка на старом пузыре
  // иначе опубликовала бы новейшую версию из общего ключа (та же грабля, что в утреннем)
  if (env.POST_KV) {
    try {
      const rj = await resp.json();
      const mid = rj && rj.ok && rj.result && rj.result.message_id;
      if (mid != null) await env.POST_KV.put("fi:post:" + to + ":" + mid, text, { expirationTtl: 86400 });
    } catch (e) { /* привязка — best effort */ }
  }
  if (res.warn.length) {
    await tg(env, "sendMessage", { chat_id: to, parse_mode: "HTML",
      text: "⚠️ <b>Проверьте перед отправкой</b> — модель не всё исправила даже со второй попытки:\n• " +
            res.warn.map(esc).join("\n• ") });
  }
}

// ============================================================================
// Админка сейлзов: /submit → карточка модератору → ✅ коммит в GitHub
// ============================================================================

// Белые списки полей по разделам — в публичные файлы попадает только это.
const SUBMIT_SECTIONS = {
  board: {
    label: "Текущие продукты (доска)",
    file: "data/instruments.js",
    // currency: без неё всё, что заводит сейлз, молча становилось рублёвым
    // settle: валюта расчётов автоколла отличается от валюты номинала
    str: ["id", "type", "structure", "name", "underlying", "cls", "uRef", "tenor", "expiry", "currency", "settle"],
    // ku — коэффициент участия бустера; couponPa/couponBarrier/callBarrier/
    // nonCall/obsPerYear — автоколл. Без них белый список молча выбрасывал
    // параметры, и продукт уезжал на доску пустой оболочкой.
    num: ["spot", "strike", "strike2", "participation", "protectionPct", "cap", "quote", "chg", "minNom",
          "ku", "couponPa", "couponBarrier", "callBarrier", "nonCall", "obsPerYear"],
    arr: ["basket"],
    required: ["id", "type", "name", "underlying", "cls", "expiry", "quote"],
  },
  offering: {
    label: "На размещении",
    file: "data/offerings.js",
    str: ["id", "family", "kind", "name", "status", "statusLabel", "teaser", "issuer", "serial",
          "isin", "reference", "currency", "placement", "placementLabel", "maturity", "tenor",
          "venue", "how", "risk", "accent", "protection", "participation", "fx"],
    num: ["nominal", "price", "redeem"],
    arr: ["dealers"],
    required: ["id", "family", "kind", "name", "status", "teaser", "issuer", "serial", "price", "how", "risk"],
  },
  placement: {
    label: "Размещённые выпуски",
    file: "data/placements.js",
    // basket и payoff вложенные — их собирает отдельная ветка sanitizeItem:
    // страница падает без корзины и без объекта payoff, общая обработка их не соберёт
    str: ["isin", "name", "serial", "kind", "currency", "issueStart", "maturity", "regNumber"],
    num: ["notional", "bid"],
    bool: ["fx"],
    required: ["isin", "name", "kind", "maturity"],
  },
  digest: {
    label: "Дайджест (идея недели)",
    file: "data/digest.js",
    str: ["id", "family", "kind", "name", "underlying", "teaser", "tenor",
          "hypothesis", "situation", "conclusion", "how", "payout"],
    num: [],
    arr: ["factors"],
    obj: { metric: ["v", "k"], p: ["asset", "price", "upside", "protection"],
           payoff: null /* отдельная обработка: type + числа */ },
    bool: ["fx"],
    required: ["id", "family", "kind", "name", "underlying", "teaser", "hypothesis", "how", "payout"],
  },
};

function cleanStr(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 600); }
function cleanNum(v) { const n = Number(v); return isFinite(n) ? n : null; }

function sanitizeItem(section, raw) {
  const cfg = SUBMIT_SECTIONS[section];
  const out = {};
  for (const k of cfg.str) { const v = cleanStr(raw[k]); if (v) out[k] = v; }
  for (const k of cfg.num || []) { const v = cleanNum(raw[k]); if (v != null) out[k] = v; }
  for (const k of cfg.bool || []) { if (raw[k] === true || raw[k] === "true") out[k] = true; }
  for (const k of cfg.arr || []) {
    if (Array.isArray(raw[k])) {
      const a = raw[k].map((x) => cleanStr(x, 200)).filter(Boolean).slice(0, 8);
      if (a.length) out[k] = a;
    }
  }
  if (cfg.obj) {
    for (const [k, fields] of Object.entries(cfg.obj)) {
      const src = raw[k];
      if (!src || typeof src !== "object") continue;
      if (k === "payoff") {
        const t = cleanStr(src.type, 20);
        if (["call", "callcap", "digital", "protected", "booster", "fixed", "portfolio"].includes(t)) {
          const p = { type: t };
          // partPct/strikePct — защита капитала с доски: участие в росте и страйк опциона
          for (const nk of ["capPct", "premiumPct", "couponPct", "barrierPct", "kuPct",
                            "entryPct", "gainPct", "floorPct", "partPct", "strikePct"]) {
            const v = cleanNum(src[nk]); if (v != null) p[nk] = v;
          }
          out.payoff = p;
        }
        continue;
      }
      const o = {};
      for (const f of fields) { const v = cleanStr(src[f], 200); if (v) o[f] = v; }
      if (Object.keys(o).length) out[k] = o;
    }
  }
  if (section === "placement") {
    // ISIN — ключ выпуска (id у размещений нет): 12 знаков, верхний регистр
    if (out.isin) out.isin = out.isin.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    // Даты храним в ISO, как отдаёт бэкофис: страница сравнивает maturity строково
    for (const dk of ["issueStart", "maturity"]) {
      if (!out[dk]) continue;
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(out[dk]);
      if (m) out[dk] = m[3] + "-" + m[2] + "-" + m[1];
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(out[dk])) delete out[dk];
    }
    if (out.kind !== "coupon" && out.kind !== "participation") delete out.kind;
    // Корзина: до 4 бумаг, имя обязательно; без f0 карточка живёт (фиксинг «—»)
    const basket = (Array.isArray(raw.basket) ? raw.basket : []).map((b) => {
      if (!b || typeof b !== "object") return null;
      const o = { n: cleanStr(b.n, 80), w: 1 };
      const t = cleanStr(b.t, 20); if (t) o.t = t;
      const f0 = cleanNum(b.f0); if (f0 != null) o.f0 = f0;
      return o.n ? o : null;
    }).filter(Boolean).slice(0, 4);
    if (basket.length) out.basket = basket;
    // payoff обязан существовать даже пустым — паспорт выпуска читает его поля напрямую
    const p = raw.payoff && typeof raw.payoff === "object" ? raw.payoff : {};
    const pp = {};
    if (out.kind === "coupon") {
      for (const nk of ["couponPa", "couponPeriodPct", "couponBarrierPct", "acBarrierPct", "obsCount"]) {
        const v = cleanNum(p[nk]); if (v != null) pp[nk] = v;
      }
      if (p.memory === true || p.memory === "true") pp.memory = true;
      const pb = cleanNum(p.protectionBarrierPct);
      if (pb != null) pp.protection = { type: "EKI", barrierPct: pb };
    } else {
      for (const nk of ["participationPct", "protectionPct", "strikePct", "strike2Pct"]) {
        const v = cleanNum(p[nk]); if (v != null) pp[nk] = v;
      }
      const ot = cleanStr(p.optType, 10).toUpperCase();
      if (ot === "CALL" || ot === "PUT") pp.optType = ot;
      if (p.style === "EUROPEAN") pp.style = "EUROPEAN";
    }
    out.payoff = pp;
    out.src = "sales";
    const missing = cfg.required.filter((k) => out[k] == null || out[k] === "");
    if (!out.basket) missing.push("basket");
    if (out.kind === "coupon" && pp.couponPa == null) missing.push("couponPa");
    if (out.kind === "participation" && pp.participationPct == null) missing.push("participationPct");
    return { item: out, missing };
  }
  if (out.id) out.id = out.id.toLowerCase().replace(/[^\w.-]+/g, "-").slice(0, 60);
  const missing = cfg.required.filter((k) => out[k] == null || out[k] === "");
  return { item: out, missing };
}

// Решение модератора по карточке — в KV под её message_id: админка спрашивает
// статусы и показывает автору «опубликовано» или «отклонено» вместо вечного
// «ждёт одобрения».
async function reqStatus(env, mid, st) {
  if (!env.POST_KV || !mid) return;
  try {
    await env.POST_KV.put("req:" + mid, JSON.stringify({ s: st, ts: Date.now() }), { expirationTtl: REQ_TTL });
  } catch (e) { /* статус необязателен */ }
}

async function handleSubmit(request, env, cors, ctx) {
  if (!env.SALES_KEYS || !env.ADMIN_CHAT_ID) return json({ ok: false, error: "not_configured" }, 503, cors);
  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400, cors); }

  // Персональный ключ → имя сейлза
  const key = cleanStr(data.key, 100);
  let author = null;
  for (const pair of env.SALES_KEYS.split(",")) {
    const i = pair.indexOf(":");
    if (i > 0 && pair.slice(i + 1).trim() === key && key) { author = pair.slice(0, i).trim(); break; }
  }
  if (!author) return json({ ok: false, error: "bad_key" }, 403, cors);

  // Новый PDF-дайджест: файл через Worker не гоняем — сейлз шлёт его Руслану в Telegram,
  // а отсюда уходит только отбивка-уведомление (без кнопок и модерации).
  if (data.action === "digestnotify") {
    const date = cleanStr(data.date, 20);
    if (!date) return json({ ok: false, error: "no_date" }, 422, cors);
    const rr = await tg(env, "sendMessage", {
      chat_id: env.ADMIN_CHAT_ID, parse_mode: "HTML",
      text: "📄 <b>Новый PDF-дайджест</b>\n<b>" + esc(author) + "</b> планирует разместить выпуск <b>" + esc(date) + "</b>.\nФайл придёт вам в Telegram — после этого обновите PDF на сайте.",
    });
    if (!rr.ok) return json({ ok: false, error: "telegram_failed" }, 502, cors);
    return json({ ok: true, mid: rr.result && rr.result.message_id }, 200, cors);
  }

  // ── Эмиссионные документы к размещённым выпускам ──
  // PDF в Telegram НЕ ходит (решение Руслана 14.08.2026: «пдф ходит тяжело»): файл
  // кладётся в KV на неделю, а модератору уходит обычная текстовая заявка с
  // параметрами. По ✅ бот забирает байты из KV и коммитит docs/<файл> +
  // data/placement_docs.js; по ❌ ключ просто удаляется.
  // ── Документы к размещению: КУВ, КИД, презентация ──
  // Тот же конвейер, что у документов размещённых выпусков: файл ждёт одобрения
  // в KV, а не в репозитории. Репозиторий ПУБЛИЧНЫЙ, и неодобренный документ иначе
  // был бы доступен всем ещё до ✅ — и навсегда остался бы в истории git.
  // Отличие одно: ключ здесь id размещения, а не ISIN (у части размещений ISIN
  // ещё нет), и добавился третий тип — презентация.
  if (data.action === "offeringdoc") {
    const oid = slugId(cleanStr(data.id, 60));
    if (!oid || oid === "idea") return json({ ok: false, error: "no_id" }, 422, cors);
    const kind = ["kuv", "kid", "preso", "other"].includes(data.docKind) ? data.docKind : null;
    if (!kind) return json({ ok: false, error: "bad_kind" }, 422, cors);
    const docName = cleanStr(data.docName, 80);
    if (kind === "other" && !docName) return json({ ok: false, error: "no_name" }, 422, cors);
    const b64 = String(data.fileB64 || "").replace(/^data:[^,]*,/, "");
    // %PDF- в base64 = JVBERi0: не-PDF отбиваем до похода в Telegram
    if (!b64.startsWith("JVBERi0")) return json({ ok: false, error: "not_pdf" }, 422, cors);
    if (b64.length > 20 * 1024 * 1024) return json({ ok: false, error: "too_big" }, 422, cors);
    let bytes;
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
    catch { return json({ ok: false, error: "bad_base64" }, 422, cors); }

    // Имена файлов — по уже сложившемуся в docs/ обычаю: kuv-, kid-, preso-.
    const file = kind === "kuv" ? "docs/kuv-" + oid + ".pdf"
      : kind === "kid" ? "docs/kid-" + oid + ".pdf"
      : kind === "preso" ? "docs/preso-" + oid + ".pdf"
      : "docs/doc-" + oid + "-" + slugId(docName) + ".pdf";
    const label = kind === "kuv" ? "Ключевые условия выпуска (КУВ)"
      : kind === "kid" ? "Ключевой информационный документ (КИД)"
      : kind === "preso" ? (docName ? "Презентация: " + docName : "Презентация")
      : docName;

    if (!env.POST_KV) return json({ ok: false, error: "kv_not_configured" }, 503, cors);
    const kvKey = "pdoc:" + crypto.randomUUID();
    try { await env.POST_KV.put(kvKey, bytes.buffer, { expirationTtl: 604800 }); }
    catch (e) { return json({ ok: false, error: "kv_put_failed" }, 502, cors); }

    const payload = JSON.stringify({ s: "odoc", oid, file, label, size: docSize(bytes.length), by: author, k: kvKey });
    const text = "📎 <b>Документ к размещению</b>\n" +
      "Выпуск: <b>" + esc(oid) + "</b>\n" + esc(label) + "\n" +
      esc(file.split("/").pop()) + " · " + esc(docSize(bytes.length)) +
      " · от <b>" + esc(author) + "</b>\n\n<pre>" + esc(payload) + "</pre>";
    const rr = await tg(env, "sendMessage", {
      chat_id: env.ADMIN_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Прикрепить", callback_data: "pub" },
        { text: "❌ Отклонить", callback_data: "rej" },
      ]] },
    });
    let sentOk = false;
    try { sentOk = (await rr.json()).ok === true; } catch (e) {}
    if (!sentOk) {
      try { await env.POST_KV.delete(kvKey); } catch (e) {}   // карточки не будет — файл ни к чему
      return json({ ok: false, error: "telegram_failed" }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  }

  if (data.action === "placementdoc") {
    const isin = cleanStr(data.isin, 20).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (!/^[A-Z0-9]{12}$/.test(isin)) return json({ ok: false, error: "bad_isin" }, 422, cors);
    const kind = ["kuv", "kid", "other"].includes(data.docKind) ? data.docKind : null;
    if (!kind) return json({ ok: false, error: "bad_kind" }, 422, cors);
    const docName = cleanStr(data.docName, 80);
    if (kind === "other" && !docName) return json({ ok: false, error: "no_name" }, 422, cors);
    const b64 = String(data.fileB64 || "").replace(/^data:[^,]*,/, "");
    // %PDF- в base64 = JVBERi0: не-PDF отбиваем до похода в Telegram
    if (!b64.startsWith("JVBERi0")) return json({ ok: false, error: "not_pdf" }, 422, cors);
    if (b64.length > 20 * 1024 * 1024) return json({ ok: false, error: "too_big" }, 422, cors);
    let bytes;
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
    catch { return json({ ok: false, error: "bad_base64" }, 422, cors); }
    const file = kind === "kuv" ? "docs/kuv-" + isin + ".pdf"
      : kind === "kid" ? "docs/kid-" + isin + ".pdf"
      : "docs/doc-" + isin + "-" + slugId(docName) + ".pdf";
    const label = kind === "kuv" ? "Ключевые условия выпуска (КУВ)"
      : kind === "kid" ? "Ключевой информационный документ (КИД)" : docName;
    // Файл ждёт одобрения в KV, а не в репозитории: репозиторий публичный, и
    // неодобренный документ иначе был бы доступен всем ещё до ✅ — и навсегда остался
    // бы в истории git. Неделя — с запасом, дальше ключ протухает сам.
    if (!env.POST_KV) return json({ ok: false, error: "kv_not_configured" }, 503, cors);
    const kvKey = "pdoc:" + crypto.randomUUID();
    try { await env.POST_KV.put(kvKey, bytes.buffer, { expirationTtl: 604800 }); }
    catch (e) { return json({ ok: false, error: "kv_put_failed" }, 502, cors); }

    const payload = JSON.stringify({ s: "pdoc", isin, file, label, by: author, k: kvKey });
    const kb = Math.round(bytes.length / 1024);
    const text = "📎 <b>Документ к выпуску</b>\n" +
      "ISIN: <b>" + esc(isin) + "</b>\n" + esc(label) + "\n" +
      esc(file.split("/").pop()) + " · " + (kb > 1024 ? (kb / 1024).toFixed(1) + " МБ" : kb + " КБ") +
      " · от <b>" + esc(author) + "</b>\n\n<pre>" + esc(payload) + "</pre>";
    const rr = await tg(env, "sendMessage", {
      chat_id: env.ADMIN_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Прикрепить", callback_data: "pub" },
        { text: "❌ Отклонить", callback_data: "rej" },
      ]] },
    });
    let sentOk = false;
    try { sentOk = (await rr.json()).ok === true; } catch (e) {}
    if (!sentOk) {
      try { await env.POST_KV.delete(kvKey); } catch (e) {}   // карточки не будет — файл ни к чему
      return json({ ok: false, error: "telegram_failed" }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  }

  // ── Дайджест-самообслуживание (без модерации): идея → черновик, публикация — сейлзом ──
  // Ключ уже проверен выше (author). Правки коммитятся прямо в data/digest.js, Руслану уходит
  // уведомление без кнопок. Board/offerings/remove остаются на аппруве — их не трогаем.
  if (data.action === "digest_add") {
    const raw = data.item || {};
    if (!raw.id && raw.name) raw.id = slugId(raw.name);   // id генерим сами из названия
    const { item, missing } = sanitizeItem("digest", raw);
    if (missing.length) return json({ ok: false, error: "missing: " + missing.join(", ") }, 422, cors);
    // where:"issue" — доложить идею в УЖЕ опубликованный выпуск (issues[0]): выпуск разослан,
    // а идея дозрела. Иначе (по умолчанию) — в черновик следующего выпуска.
    const addTo = data.where === "issue" ? "issue" : "draft";
    let result;
    try {
      result = await commitDigestFile(env, (obj) => {
        const list = addTo === "issue"
          ? ((obj.issues && obj.issues[0] && obj.issues[0].ideas) || null)
          : obj.draft.ideas;
        if (!list) throw new Error("no_issue");
        item.id = uniqueId(item.id, new Set(list.map((i) => i.id)));
        list.push(item);
        return { msg: (addTo === "issue" ? "Дайджест: +идея " : "Черновик дайджеста: +идея ") +
                      (item.name || item.id) + (addTo === "issue" ? " (в выпуске)" : "") + " (от " + author + ")",
                 out: { id: item.id, count: list.length, where: addTo } };
      });
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 502, cors); }
    await tg(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, parse_mode: "HTML",
      text: addTo === "issue"
        ? "🟢 <b>Дайджест: новая идея в выпуске</b>\n<b>" + esc(author) + "</b> добавил «" +
          esc(item.name || item.id) + "» в <b>опубликованный выпуск</b> — PDF пересоберётся автоматически. Идей: " +
          result.count + "."
        : "🟠 <b>Черновик дайджеста</b>\n<b>" + esc(author) + "</b> добавил идею «" + esc(item.name || item.id) +
          "». В черновике: " + result.count + "." });
    return json({ ok: true, id: result.id, count: result.count, where: result.where }, 200, cors);
  }

  // Правка текста уже заведённой идеи — в черновике (where:"draft") или в опубликованном
  // выпуске (where:"issue"). Меняются ТОЛЬКО описательные поля: цифры, график и параметры
  // выведены из продукта автоматически, и при исправлении опечатки трогать их нечего —
  // так правка не может разойтись с витриной. Пустая строка в необязательном поле = убрать его.
  if (data.action === "digest_edit") {
    const eid = cleanStr(data.id, 60);
    if (!eid) return json({ ok: false, error: "no_id" }, 422, cors);
    const where = data.where === "issue" ? "issue" : "draft";
    const src = data.item || {};
    const patch = {};
    for (const k of ["name", "teaser", "hypothesis", "situation", "conclusion"]) {
      if (typeof src[k] === "string") patch[k] = cleanStr(src[k]);
    }
    if (Array.isArray(src.factors)) {
      patch.factors = src.factors.map((x) => cleanStr(x, 200)).filter(Boolean).slice(0, 8);
    }
    if (!Object.keys(patch).length) return json({ ok: false, error: "nothing_to_edit" }, 422, cors);
    // тизер и гипотеза обязательны — их нельзя опустошить правкой
    for (const k of ["teaser", "hypothesis"]) {
      if (patch[k] === "") return json({ ok: false, error: "empty: " + k }, 422, cors);
    }
    let result;
    try {
      result = await commitDigestFile(env, (obj) => {
        const list = where === "issue"
          ? ((obj.issues && obj.issues[0] && obj.issues[0].ideas) || null)
          : obj.draft.ideas;
        if (!list) throw new Error("no_issue");
        const idea = list.find((i) => i.id === eid);
        if (!idea) throw new Error("not_found");
        for (const k of Object.keys(patch)) {
          const v = patch[k];
          if (v === "" || (Array.isArray(v) && !v.length)) delete idea[k];
          else idea[k] = v;
        }
        return { msg: "Дайджест: правка идеи " + (idea.name || eid) +
                      (where === "issue" ? " (в выпуске)" : " (в черновике)") + " (от " + author + ")",
                 out: { id: eid, where } };
      });
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 502, cors); }
    // Правка опубликованного выпуска меняет клиентский PDF и витрину — Руслану сообщаем всегда
    if (env.ADMIN_CHAT_ID) {
      await tg(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, parse_mode: "HTML",
        text: "✏️ <b>Правка дайджеста</b>\n<b>" + esc(author) + "</b> поправил текст идеи «" + esc(eid) + "» " +
              (where === "issue" ? "в <b>опубликованном выпуске</b> — PDF пересоберётся автоматически."
                                 : "в черновике.") });
    }
    return json({ ok: true, id: result.id, where: result.where }, 200, cors);
  }

  if (data.action === "digest_remove") {
    const rid = cleanStr(data.id, 60);
    if (!rid) return json({ ok: false, error: "no_id" }, 422, cors);
    let result;
    try {
      result = await commitDigestFile(env, (obj) => {
        const before = obj.draft.ideas.length;
        obj.draft.ideas = obj.draft.ideas.filter((i) => i.id !== rid);
        if (obj.draft.ideas.length === before) throw new Error("not_found");
        return { msg: "Черновик дайджеста: −идея " + rid + " (от " + author + ")",
                 out: { count: obj.draft.ideas.length } };
      });
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 502, cors); }
    return json({ ok: true, count: result.count }, 200, cors);
  }

  if (data.action === "digest_publish") {
    let result;
    try {
      result = await commitDigestFile(env, (obj) => {
        if (!obj.draft.ideas.length) throw new Error("empty_draft");
        const now = new Date(Date.now() + 3 * 3600 * 1000);   // МСК = UTC+3
        const dd = String(now.getUTCDate()).padStart(2, "0");
        const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
        const yy = now.getUTCFullYear();
        const id = yy + "-" + mm + "-" + dd;
        const MON = ["января", "февраля", "марта", "апреля", "мая", "июня",
                     "июля", "августа", "сентября", "октября", "ноября", "декабря"];
        obj.issues = obj.issues.filter((x) => x.id !== id);   // не плодим дубль за один день
        obj.issues.unshift({
          id, date: dd + "." + mm + "." + yy,
          label: now.getUTCDate() + " " + MON[now.getUTCMonth()] + " " + yy,
          summary: obj.draft.ideas.map((i) => i.underlying || i.name).slice(0, 7).join(", "),
          intro: "Идеи недели: по каждой — гипотеза, рыночная ситуация, факторы и параметры выпуска.",
          qualNote: "Продукты доступны только квалифицированным инвесторам. Не является индивидуальной инвестиционной рекомендацией.",
          ideas: obj.draft.ideas,
          pdf: "docs/digest/rumberg-digest-" + id + ".pdf",
          pdfName: "Румберг Дайджест " + dd + "." + mm + ".pdf",
        });
        obj.draft = { ideas: [] };
        return { msg: "Дайджест: опубликован выпуск " + id + " (" + obj.issues[0].ideas.length + " идей, от " + author + ")",
                 out: { id, count: obj.issues[0].ideas.length } };
      });
    } catch (e) {
      const m = String(e && e.message || e);
      return json({ ok: false, error: m === "empty_draft" ? "empty_draft" : m }, m === "empty_draft" ? 422 : 502, cors);
    }
    await tg(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, parse_mode: "HTML",
      text: "📢 <b>Опубликован дайджест</b>\n<b>" + esc(author) + "</b> выпустил дайджест от " + esc(result.id) +
            " (" + result.count + " идей). PDF соберётся сам, сайт обновится за 1–3 минуты." });
    return json({ ok: true, id: result.id, count: result.count }, 200, cors);
  }

  // ── СУДЬБА ЗАЯВКИ: статус и отзыв ──
  // Очередь модерации живёт сообщениями в Telegram, и браузер её не видит:
  // сейлз узнавал об отказе только от Руслана. Теперь решение модератора
  // записывается в KV по message_id карточки, а админка его спрашивает.
  // Заодно автор может отозвать свою заявку, пока по ней не нажали.
  if (data.action === "req_status") {
    const ids = Array.isArray(data.mids) ? data.mids.slice(0, 40) : [];
    const out = {};
    if (env.POST_KV) {
      for (const m of ids) {
        const k = String(m).replace(/\D/g, "");
        if (!k) continue;
        try {
          const v = await env.POST_KV.get("req:" + k, "json");
          if (v) out[k] = v;
        } catch (e) { /* статус необязателен */ }
      }
    }
    return json({ ok: true, status: out }, 200, cors);
  }

  // Отзыв: правим СВОЮ же карточку в Telegram и снимаем кнопки, чтобы модератор
  // не нажал ✅ по ошибке уже после отзыва.
  if (data.action === "withdraw") {
    const mid = parseInt(String(data.mid || "").replace(/\D/g, ""), 10);
    if (!mid) return json({ ok: false, error: "no_mid" }, 422, cors);
    const st = env.POST_KV ? await env.POST_KV.get("req:" + mid, "json").catch(() => null) : null;
    if (st && st.s !== "wait") return json({ ok: false, error: "already_decided" }, 409, cors);
    const r = await tg(env, "editMessageText", {
      chat_id: env.ADMIN_CHAT_ID, message_id: mid, parse_mode: "HTML",
      text: "⛔ <b>Отозвано автором</b> · " + esc(author) + "\nЗаявка отменена до решения — ничего делать не нужно.",
    });
    if (!r.ok) return json({ ok: false, error: "telegram_failed" }, 502, cors);
    if (env.POST_KV) {
      try {
        await env.POST_KV.put("req:" + mid, JSON.stringify({ s: "withdrawn", by: author, ts: Date.now() }),
                              { expirationTtl: REQ_TTL });
      } catch (e) {}
    }
    return json({ ok: true }, 200, cors);
  }

  // ── ПАРТНЁРЫ И ИХ СДЕЛКИ ИЗ АДМИНКИ ──
  // Конвейер (решение Руслана 26.08.2026): НОВОГО ПАРТНЁРА сейлз заводит заявкой
  // с его ✅ (partner_create → карточка → pinfo в KV), а СДЕЛКИ под заведённого
  // партнёра пишутся СРАЗУ, без одобрения — Руслану уходит отбивка без кнопок.
  // Ключ партнёра админку по-прежнему не открывает (есть тест), так что вписать
  // вознаграждение самому себе партнёр не может. Ключ входа на стол остаётся
  // ручным секретом PARTNER_KEYS — его добавляет только Руслан в Cloudflare.

  // Список партнёров для выпадающего списка: отдаём ТОЛЬКО метки (не ключи) и
  // сводку по сделкам, чтобы сейлз видел, что уже заведено, и не задваивал.
  if (data.action === "partners") {
    const refs = await partnerRefs(env, true);
    // Кто может войти на стол и у кого ключ ещё ждёт: ОДИН list по pkey — срок
    // показа продублирован в metadata, поэтому значения (а с ними открытые ключи)
    // читать не нужно. Сбой list отдаёт флаги как null: «не знаем» и «входа нет» —
    // разные вещи, а второе отправило бы сейлза гасить рабочий ключ перевыпуском.
    const hasKey = new Set(keyPairs(env.PARTNER_KEYS).map(function (x) { return x[0]; }));
    const ready = new Set();
    let flagsOk = true;
    if (env.POST_KV) {
      try {
        const now = Date.now();
        const k = await env.POST_KV.list({ prefix: "pkey:", limit: 1000 });
        for (const x of k.keys) {
          const r2 = x.name.slice(5);
          hasKey.add(r2);
          if (x.metadata && x.metadata.until && x.metadata.until > now) ready.add(r2);
        }
      } catch (e) { flagsOk = false; }
    }
    const out = [];
    for (const ref of refs) {
      const list = await dealsGet(env, ref);
      let sum = 0;
      for (const d of list) sum += Number(d.reward) || 0;
      const info = await pinfoGet(env, ref);
      out.push({ ref: ref, name: (info && info.name) || "", count: list.length, reward: sum,
                 hasKey: flagsOk ? hasKey.has(ref) : null, keyReady: flagsOk ? ready.has(ref) : null });
    }
    out.sort(function (a, b) { return a.ref < b.ref ? -1 : 1; });
    return json({ ok: true, partners: out }, 200, cors);
  }

  // Забрать выданный ключ входа — ОДИН раз. Ключ лежит в pshow только до первого
  // показа: дальше его нет ни у кого, кроме партнёра, и перевыпуск делает Руслан
  // (/partnerkey). Руслану уходит след — кто и когда забрал.
  if (data.action === "partner_key") {
    if (!env.POST_KV) return json({ ok: false, error: "kv_not_configured" }, 503, cors);
    const ref = cleanStr(data.ref, 40).toLowerCase();
    if (!(await partnerRefs(env, true)).includes(ref)) return json({ ok: false, error: "bad_ref" }, 422, cors);
    let got;
    try { got = await takeDeskKey(env, ref, author); }
    catch (e) { return json({ ok: false, error: "kv_key_failed" }, 502, cors); }
    if (got.error) return json({ ok: false, error: got.error }, 404, cors);
    // След Руслану — только на ПЕРВЫЙ показ: повтор в окне 15 минут это тот же
    // сейлз, у которого не доехал ответ, и второе уведомление сбивало бы с толку.
    if (got.first) {
      const note = tg(env, "sendMessage", {
        chat_id: env.ADMIN_CHAT_ID, parse_mode: "HTML", disable_web_page_preview: true,
        text: "🔑 <b>Ключ входа забран</b>\nПартнёр: <b>" + esc(ref) + "</b> · забрал <b>" +
              esc(author) + "</b>\n<i>Дальше ключ есть только у партнёра. Перевыпуск — " +
              "<code>/partnerkey " + esc(ref) + "</code></i>",
      }).catch(function () {});
      // Не задерживаем ответ: ключ уже в руках, а обрыв на этом шаге стоил бы
      // сейлзу самого ключа.
      if (ctx && ctx.waitUntil) ctx.waitUntil(note); else await note;
    }
    return json({ ok: true, ref: ref, key: got.key }, 200, cors);
  }

  // Заявка на нового партнёра — единственный шаг конвейера, который остаётся
  // под ✅ Руслана: партнёр — это контрагент. Метка занята (ключом, реквизитами
  // или сейлзом) — отказ сразу, до карточки.
  if (data.action === "partner_create") {
    if (!env.POST_KV) return json({ ok: false, error: "kv_not_configured" }, 503, cors);
    const ref = cleanStr(data.ref, 40).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(ref)) return json({ ok: false, error: "bad_new_ref" }, 422, cors);
    // «boss» — служебная метка сводного кабинета (соль хэша bkey), партнёру её не отдаём.
    const taken = new Set((await partnerRefs(env, true)).concat(knownRefs(env), ["boss"]));
    if (taken.has(ref)) return json({ ok: false, error: "ref_taken" }, 422, cors);
    // Ключ под меткой мог остаться от прежнего контрагента (реквизиты сняли, а
    // вход — нет): новый партнёр получил бы метку, на которую у чужого человека
    // уже есть рабочий ключ.
    try {
      if (await env.POST_KV.get("pkey:" + ref, "json")) {
        return json({ ok: false, error: "ref_taken" }, 422, cors);
      }
    } catch (e) { /* не смогли проверить — дальше перепроверит ✅ */ }
    // У освободившейся метки (/partnerrm) могла остаться книга сделок прежнего
    // контрагента — новый партнёр унаследовал бы чужие объёмы и вознаграждения.
    if ((await dealsGet(env, ref)).length) return json({ ok: false, error: "ref_has_deals" }, 422, cors);
    const p = { name: cleanStr(data.name, 120) };
    if (!p.name) return json({ ok: false, error: "no_name" }, 422, cors);
    const inn = cleanStr(data.inn, 20).replace(/\D/g, "");
    if (inn) {
      if (inn.length !== 10 && inn.length !== 12) return json({ ok: false, error: "bad_inn" }, 422, cors);
      p.inn = inn;
    }
    // ОГРН и ОГРНИП различаются числом цифр (13 / 15) — поле в форме одно.
    const ogrn = cleanStr(data.ogrn, 20).replace(/\D/g, "");
    if (ogrn) {
      if (ogrn.length === 13) p.ogrn = ogrn;
      else if (ogrn.length === 15) p.ogrnip = ogrn;
      else return json({ ok: false, error: "bad_ogrn" }, 422, cors);
    }
    const contract = cleanStr(data.contract, 60);
    if (contract) p.contract = contract;
    const ppayload = JSON.stringify({ s: "partner", by: author, ref: ref, p: p });
    const ptext =
      "🆕 <b>Заявка на нового партнёра</b> · от <b>" + esc(author) + "</b>\n" +
      pinfoText(ref, p) +
      "\n\nПосле «Завести» бот сам выдаст ключ входа в рабочий стол и покажет его здесь, " +
      "а сейлзы смогут записывать сделки этого партнёра без одобрения." +
      "\n\n<pre>" + esc(ppayload) + "</pre>";
    const pr = await tg(env, "sendMessage", {
      chat_id: env.ADMIN_CHAT_ID, text: ptext, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Завести", callback_data: "pub" },
        { text: "❌ Отклонить", callback_data: "rej" },
      ]] },
    });
    if (!pr.ok) return json({ ok: false, error: "telegram_failed" }, 502, cors);
    // tg() отдаёт сырой Response — message_id лежит в JSON-теле, без разбора mid
    // был бы undefined и статус заявки в «Моих заявках» не обновлялся бы никогда.
    const pj = await pr.json().catch(() => null);
    return json({ ok: true, mid: (pj && pj.result && pj.result.message_id) || 0 }, 200, cors);
  }

  // Сделки одного партнёра — чтобы сейлз мог свериться и снять ошибочную запись.
  if (data.action === "deals_list") {
    const ref = cleanStr(data.ref, 40).toLowerCase();
    if (!(await partnerRefs(env, true)).includes(ref)) {
      return json({ ok: false, error: "bad_ref" }, 422, cors);
    }
    const list = (await dealsGet(env, ref)).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
    return json({ ok: true, ref: ref, deals: list }, 200, cors);
  }

  // Новая сделка. Проверки те же, что у команды /deal: чужая метка, непонятная
  // дата, нечисловые суммы и вознаграждение больше объёма — отказ сразу.
  // Пишется БЕЗ одобрения (решение Руслана 26.08.2026) — ему уходит отбивка
  // без кнопок. Гонка двух сейлзов за один ключ deals:<метка> теоретически
  // возможна (KV ~1 запись/сек), но сделки по одному партнёру заводит один
  // человек — принято осознанно.
  if (data.action === "deal") {
    if (!env.POST_KV) return json({ ok: false, error: "kv_not_configured" }, 503, cors);
    const ref = cleanStr(data.ref, 40).toLowerCase();
    if (!(await partnerRefs(env, true)).includes(ref)) {
      return json({ ok: false, error: "bad_ref" }, 422, cors);
    }
    const product = cleanStr(data.product, 80);
    if (!product) return json({ ok: false, error: "no_product" }, 422, cors);
    const date = dealDate(cleanStr(data.date, 20));
    if (!date) return json({ ok: false, error: "bad_date" }, 422, cors);
    const volume = dealNum(data.volume);
    if (volume === null || volume <= 0) return json({ ok: false, error: "bad_volume" }, 422, cors);
    const reward = dealNum(data.reward);
    if (reward === null || reward < 0) return json({ ok: false, error: "bad_reward" }, 422, cors);
    // Вознаграждение больше объёма — почти всегда опечатка в разряде.
    if (reward > volume) return json({ ok: false, error: "reward_gt_volume" }, 422, cors);
    let isin = cleanStr(data.isin, 12).toUpperCase();
    if (isin && !/^RU[0-9A-Z]{10}$/.test(isin)) return json({ ok: false, error: "bad_isin" }, 422, cors);

    const deal = {
      id: Math.random().toString(36).slice(2, 8),
      product: product, isin: isin, date: date, volume: volume, reward: reward,
      currency: "RUB", status: "paid", ts: Date.now(),
    };
    // Чтение книги СТРОГОЕ: dealsGet глотает ошибки и отдаёт [], а здесь пустой
    // список ушёл бы в dealsPut и стёр бы всю книгу партнёра одной записью.
    let list;
    try { list = (await env.POST_KV.get("deals:" + ref, "json")) || []; }
    catch (e) { return json({ ok: false, error: "kv_read_failed" }, 502, cors); }
    list.push(deal);
    await dealsPut(env, ref, list);
    // Отбивка Руслану — уже свершившийся факт, кнопок нет. Telegram упал —
    // сделка всё равно записана, заявку не роняем, но честно отдаём notified.
    const dtext =
      "🤝 <b>Сделка заведена</b> (без одобрения) · от <b>" + esc(author) + "</b>\n" +
      "Партнёр: <b>" + esc(ref) + "</b>\n" +
      esc(product) + (isin ? " · <code>" + esc(isin) + "</code>" : "") + "\n" +
      "Дата: " + esc(date.split("-").reverse().join(".")) + "\n" +
      "Объём: <b>" + dealMoney(volume, "RUB") + "</b> · вознаграждение: <b>" + dealMoney(reward, "RUB") + "</b>";
    let notified = false;
    try {
      const nr = await tg(env, "sendMessage", {
        chat_id: env.ADMIN_CHAT_ID, text: dtext, parse_mode: "HTML", disable_web_page_preview: true,
      });
      notified = !!(nr && nr.ok);
    } catch (e) { /* отбивка не критична */ }
    return json({ ok: true, id: deal.id, direct: true, notified: notified }, 200, cors);
  }

  // Снятие ошибочной сделки — тоже сразу, иначе сейлз, заведший сделку без
  // одобрения, чинил бы свою же опечатку через Руслана. Отбивка сохраняет след.
  if (data.action === "deal_remove") {
    if (!env.POST_KV) return json({ ok: false, error: "kv_not_configured" }, 503, cors);
    const ref = cleanStr(data.ref, 40).toLowerCase();
    const dealId = cleanStr(data.id, 20);
    if (!(await partnerRefs(env, true)).includes(ref)) {
      return json({ ok: false, error: "bad_ref" }, 422, cors);
    }
    if (!dealId) return json({ ok: false, error: "no_id" }, 422, cors);
    let list;
    try { list = (await env.POST_KV.get("deals:" + ref, "json")) || []; }
    catch (e) { return json({ ok: false, error: "kv_read_failed" }, 502, cors); }
    const gone = list.find(function (x) { return x.id === dealId; });
    if (!gone) return json({ ok: false, error: "not_found" }, 404, cors);
    await dealsPut(env, ref, list.filter(function (x) { return x.id !== dealId; }));
    const rtext =
      "🗑 <b>Сделка снята</b> (без одобрения) · от <b>" + esc(author) + "</b>\n" +
      "Партнёр: <b>" + esc(ref) + "</b>\n" +
      esc(gone.product || dealId) + " · объём " + dealMoney(gone.volume || 0, "RUB") +
      " · вознаграждение " + dealMoney(gone.reward || 0, "RUB");
    let notified = false;
    try {
      const nr = await tg(env, "sendMessage", {
        chat_id: env.ADMIN_CHAT_ID, text: rtext, parse_mode: "HTML", disable_web_page_preview: true,
      });
      notified = !!(nr && nr.ok);
    } catch (e) { /* отбивка не критична */ }
    return json({ ok: true, direct: true, notified: notified }, 200, cors);
  }

  const section = cleanStr(data.section, 20);
  if (!SUBMIT_SECTIONS[section]) return json({ ok: false, error: "bad_section" }, 422, cors);

  // Снятие продукта с сайта — заявка тоже идёт через аппрув модератора
  if (data.action === "remove") {
    const rmId = cleanStr(data.id, 60);
    const rmName = cleanStr(data.name, 120);
    if (!rmId) return json({ ok: false, error: "no_id" }, 422, cors);
    const rpayload = JSON.stringify({ s: section, by: author, rm: rmId });
    const rtext =
      "🗑 <b>Заявка на снятие</b>\n" +
      "Раздел: <b>" + esc(SUBMIT_SECTIONS[section].label) + "</b> · от <b>" + esc(author) + "</b>\n" +
      esc(rmName || rmId) + "\n\n<pre>" + esc(rpayload) + "</pre>";
    const rr = await tg(env, "sendMessage", {
      chat_id: env.ADMIN_CHAT_ID, text: rtext, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Снять", callback_data: "pub" },
        { text: "❌ Отклонить", callback_data: "rej" },
      ]] },
    });
    if (!rr.ok) return json({ ok: false, error: "telegram_failed" }, 502, cors);
    return json({ ok: true, mid: rr.result && rr.result.message_id }, 200, cors);
  }

  // ── Правка размещения: тот же аппрув, но запись не заменяется, а ДОПОЛНЯЕТСЯ ──
  // Форма админки покрывает только простые поля. Корзина, график выплаты, пример
  // расчёта, видео, партнёр и docs в неё не входят — у «Энергетики будущего» это
  // половина карточки. Замена объекта их бы снесла, поэтому правка сливается по
  // НЕПУСТЫМ ключам, а payload помечается ed.
  // Правка продукта доски или размещения. Для доски это важнее всего: раньше
  // опечатка лечилась «снять + завести заново», то есть двумя одобрениями, и у
  // нового продукта появлялся НОВЫЙ id — разосланная клиентам ссылка
  // /p/<id>.html умирала. При правке id не меняется никогда.
  if (data.action === "offering_edit" || data.action === "board_edit") {
    if (section !== "offering" && section !== "board") {
      return json({ ok: false, error: "edit_not_supported" }, 422, cors);
    }
    const { item: eitem } = sanitizeItem(section, data.item || {});
    if (!eitem.id) return json({ ok: false, error: "no_id" }, 422, cors);
    const changed = Object.keys(eitem).filter((k) => k !== "id");
    if (!changed.length) return json({ ok: false, error: "nothing_to_change" }, 422, cors);
    const epayload = JSON.stringify({ s: section, by: author, ed: 1, item: eitem });
    if (epayload.length > 3400) return json({ ok: false, error: "too_long" }, 422, cors);
    const etext =
      "✏️ <b>Правка " + (section === "board" ? "продукта доски" : "размещения") + "</b>\n" +
      "id: <b>" + esc(eitem.id) + "</b> · от <b>" + esc(author) + "</b>\n" +
      "Меняются поля: " + esc(changed.join(", ")) + "\n" +
      "Остальное остаётся как было" + (section === "board" ? "" : " — корзина, график, пример, видео, документы") + ".\n\n" +
      "<pre>" + esc(epayload) + "</pre>";
    const er = await tg(env, "sendMessage", {
      chat_id: env.ADMIN_CHAT_ID, text: etext, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Применить", callback_data: "pub" },
        { text: "❌ Отклонить", callback_data: "rej" },
      ]] },
    });
    if (!er.ok) return json({ ok: false, error: "telegram_failed" }, 502, cors);
    return json({ ok: true, mid: er.result && er.result.message_id }, 200, cors);
  }

  const { item, missing } = sanitizeItem(section, data.item || {});
  if (missing.length) return json({ ok: false, error: "missing: " + missing.join(", ") }, 422, cors);

  const payload = JSON.stringify({ s: section, by: author, item });
  if (payload.length > 3400) return json({ ok: false, error: "too_long" }, 422, cors);

  const cfg = SUBMIT_SECTIONS[section];
  const brief = [item.name, item.underlying, item.isin, item.price != null ? "цена " + item.price : null,
    item.quote != null ? "котировка " + item.quote : null].filter(Boolean).join(" · ");
  const text =
    "🆕 <b>Заявка на публикацию</b>\n" +
    "Раздел: <b>" + esc(cfg.label) + "</b> · от <b>" + esc(author) + "</b>\n" +
    esc(brief) + "\n\n" +
    "<pre>" + esc(payload) + "</pre>";

  const r = await tg(env, "sendMessage", {
    chat_id: env.ADMIN_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[
      { text: "✅ Опубликовать", callback_data: "pub" },
      { text: "❌ Отклонить", callback_data: "rej" },
    ]] },
  });
  if (!r.ok) return json({ ok: false, error: "telegram_failed" }, 502, cors);
  return json({ ok: true, mid: r.result && r.result.message_id }, 200, cors);
}

// --- Публикация: правка data-файла в GitHub через Contents API ---
function b64encodeUtf8(str) {
  return b64encodeBytes(new TextEncoder().encode(str));
}
function b64encodeBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}
function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function ghHeaders(env) {
  return { "Authorization": "Bearer " + env.GITHUB_TOKEN, "Accept": "application/vnd.github+json",
           "User-Agent": "so-leads-worker", "Content-Type": "application/json" };
}

function uniqueId(id, taken) {
  let out = id, n = 2;
  while (taken.has(out)) { out = id + "-" + n; n++; }
  return out;
}

// Транслит-слаг из названия — чтобы сейлз не вводил id руками (id генерится сам).
const TRANSLIT = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
  н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
function slugId(s) {
  const out = String(s || "").toLowerCase().split("").map((ch) => (TRANSLIT[ch] != null ? TRANSLIT[ch] : ch)).join("")
    .replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return out || "idea";
}

// Прямая правка data/digest.js в GitHub (для самообслуживания дайджеста, без модерации).
// mutate(obj) меняет объект на месте и возвращает { msg, out }; повтор при устаревшем sha.
async function commitDigestFile(env, mutate) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new Error("github_not_configured");
  const branch = env.GITHUB_BRANCH || "main";
  const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/data/digest.js";
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
    if (!g.ok) throw new Error("github_get_" + g.status);
    const meta = await g.json();
    const text = b64decodeUtf8(meta.content);
    const obj = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!obj.draft || !Array.isArray(obj.draft.ideas)) obj.draft = { ideas: [] };
    const { msg, out } = mutate(obj);                    // бросит — прокинется наверх
    const put = await fetch(api, {
      method: "PUT", headers: ghHeaders(env),
      body: JSON.stringify({ message: msg, content: b64encodeUtf8(renderDataFile("data/digest.js", obj)),
                             sha: meta.sha, branch }),
    });
    if (put.ok) return out;
    if (put.status !== 409) throw new Error("github_put_" + put.status);
    // 409 — параллельная правка, sha устарел: перечитываем и повторяем
  }
  throw new Error("github_conflict");
}

// Выпуск разборов в data/research.js: читаем файл, подменяем выпуск за ту же дату,
// пишем обратно. Слияние, а не перезапись: за другие дни там могут лежать записи,
// добавленные руками, и публикация не должна их стирать.
async function commitResearchIssue(env, issue) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new Error("github_not_configured");
  const branch = env.GITHUB_BRANCH || "main";
  const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/data/research.js";
  for (let attempt = 0; attempt < 3; attempt++) {
    let obj = { updated: issue.date, issues: [] }, sha;
    const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
    if (g.ok) {
      const meta = await g.json();
      sha = meta.sha;
      const text = b64decodeUtf8(meta.content);
      // Срез от ПРИСВОЕНИЯ, а не от первой скобки: в шапке файла живёт комментарий,
      // и в нём тоже бывают фигурные скобки (шаблон записи).
      const at = text.indexOf("window.RESEARCH");
      const from = at >= 0 ? text.indexOf("{", at) : -1;
      if (from >= 0) {
        try { obj = JSON.parse(text.slice(from, text.lastIndexOf("}") + 1)); }
        catch (e) { /* битый файл не должен ронять публикацию — соберём заново */ }
      }
    }
    if (!Array.isArray(obj.issues)) obj.issues = [];
    obj.issues = [issue].concat(obj.issues.filter((x) => x && x.id !== issue.id)).slice(0, RESEARCH_KEEP);
    obj.updated = issue.date;
    const body = RESEARCH_FILE_HEAD + "window.RESEARCH = " + JSON.stringify(obj, null, 1) + ";\n";
    const put = await fetch(api, {
      method: "PUT", headers: ghHeaders(env),
      body: JSON.stringify({ message: "Разборы: выпуск за " + issue.date,
                             content: b64encodeUtf8(body), sha, branch }),
    });
    if (put.ok) return;
    if (put.status !== 409) throw new Error("research_put_" + put.status);
    // 409 — параллельная правка: перечитываем и повторяем
  }
  throw new Error("research_conflict");
}

// --- Персональные превью продуктов: p/<id>.html с og-тегами + редирект на карточку ---
// Скрапер превью (Telegram) не исполняет JS, поэтому нужна статичная страница на продукт.
// Шаблон 1:1 с make_product_pages.py — чтобы массовая регенерация не давала лишних диффов.
const SHELL_BASE = "https://invest.rumberg.ru";
const SHELL_TYPE_LABEL = { discount: "Дисконтная облигация", protection: "Облигация с защитой капитала", warrant: "Варрант", booster: "Бустер", autocall: "Автоколл" };
function shellEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function shellDesc(item) {
  const tl = SHELL_TYPE_LABEL[item.type] || "Структурный продукт";
  const ua = item.underlying || "";
  const parts = [tl + (ua ? " на " + ua : "")];
  const shellNum = (v) => String(v).replace(".", ",");
  if (item.type === "autocall") {
    // у автоколла quote = КУПОН годовых, не цена входа (вход по номиналу)
    const cpn = item.couponPa != null ? item.couponPa : item.quote;
    if (cpn != null) parts.push("купон " + shellNum(cpn) + "% годовых");
  } else if (item.type === "protection") {
    // вход по номиналу; для превью полезнее участие, чем «котировка 100%»
    parts.push("вход по номиналу" + (item.participation
      ? " · участие " + shellNum(Math.round(item.participation * 100)) + "%" : ""));
  } else if (item.quote != null) {
    // у бустера quote = коэффициент участия, не цена (как в make_product_pages.py)
    parts.push(item.type === "booster"
      ? "коэффициент участия " + shellNum(item.quote) + "%"
      : "котировка " + shellNum(item.quote) + "% от номинала");
  }
  parts.push("Rumberg — структурные продукты для квалифицированных инвесторов");
  return parts.join(" · ");
}
// Описание выпуска первички — 1:1 с describe_offering() в make_product_pages.py
function shellDescOffering(o) {
  const kind = o.kind || "Выпуск на размещении";
  const parts = [kind];
  if (o.protection && kind.indexOf(o.protection) < 0) parts.push("защита капитала " + o.protection);
  if (o.participation) parts.push("участие в росте " + o.participation);
  // цена входа — ключевая цифра в превью; на витрине всегда с пометкой «индикативно»
  if (o.price != null) parts.push("цена " + String(o.price).replace(".", ",") + "% номинала · индикативно");
  if (o.tenor) parts.push(o.tenor);
  parts.push("Rumberg — структурные продукты для квалифицированных инвесторов");
  return parts.join(" · ");
}
// Есть ли персональная og-картинка продукта в репо (её рендерит make_og_products.py локально).
// Новый продукт из админки картинки ещё не имеет → отдаём общую обложку, чтобы превью
// не оказалось битым; после локального прогона превью само станет персональным.
async function ogImageFor(env, id, branch) {
  const fallback = "og-cover.png";
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return fallback;
  try {
    const r = await fetch("https://api.github.com/repos/" + env.GITHUB_REPO +
      "/contents/og/" + encodeURIComponent(id) + ".png?ref=" + branch, { headers: ghHeaders(env) });
    return r.ok ? "og/" + id + ".png" : fallback;
  } catch (e) { return fallback; }
}
// section: "board" → редирект на карточку инструмента, "offering" → на выпуск первички
// ogimg: путь картинки превью относительно корня сайта (см. ogImageFor / og_image в питоне)
function productShell(item, section, ogimg) {
  const id = item.id, B = SHELL_BASE;
  const isOffering = section === "offering";
  const target = isOffering ? "/offerings.html#" + id : "/instrument.html?id=" + id;
  // Редирект СОХРАНЯЕТ строку запроса: без этого метка сейлза (?ref=…) терялась на
  // персональной ссылке и до аналитики не доходила вовсе. У карточки в адресе уже
  // есть ?id=, поэтому метка дописывается через &; у размещения адрес заканчивается
  // якорем, и запрос обязан встать ПЕРЕД ним.
  const redir = isOffering
    ? '"/offerings.html"+location.search+"#' + id + '"'
    : '"/instrument.html?id=' + id + '"+location.search.replace("?","&")';
  const title = shellEsc(item.name || id);
  const desc = shellEsc(isOffering ? shellDescOffering(item) : shellDesc(item));
  const img = ogimg || "og-cover.png";
  return [
    '<!DOCTYPE html>', '<html lang="ru">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + title + ' — Rumberg</title>',
    '<meta name="description" content="' + desc + '">',
    '<meta property="og:type" content="website">', '<meta property="og:site_name" content="Rumberg">',
    '<meta property="og:locale" content="ru_RU">',
    '<meta property="og:title" content="' + title + '">',
    '<meta property="og:description" content="' + desc + '">',
    '<meta property="og:url" content="' + B + '/p/' + id + '.html">',
    '<meta property="og:image" content="' + B + '/' + img + '">',
    '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Rumberg — структурные продукты">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#0B0C10">',
    '<link rel="canonical" href="' + B + '/p/' + id + '.html">',
    '<script>location.replace(' + redir + ');</script>',
    "<style>html,body{margin:0;height:100%}body{background:#0B0C10;color:rgba(242,243,247,.6);font-family:'Onest',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;gap:8px}a{color:#EE7D1B}</style>",
    '</head>',
    '<body>Открываем продукт… <a href="' + target + '">перейти вручную</a></body>',
    '</html>', '',
  ].join("\n");
}
// Создать/обновить файл в репо (GET sha при наличии, затем PUT).
async function upsertFile(env, path, contentStr, message, branch) {
  const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/" + path;
  let sha;
  const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
  if (g.ok) sha = (await g.json()).sha;
  const body = { message, content: b64encodeUtf8(contentStr), branch };
  if (sha) body.sha = sha;
  const put = await fetch(api, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify(body) });
  if (!put.ok) throw new Error("shell_put_" + put.status);
}
async function deleteFile(env, path, message, branch) {
  const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/" + path;
  const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
  if (!g.ok) return; // файла нет — нечего удалять
  const del = await fetch(api, { method: "DELETE", headers: ghHeaders(env),
    body: JSON.stringify({ message, sha: (await g.json()).sha, branch }) });
  if (!del.ok) throw new Error("shell_del_" + del.status);
}

const FILE_HEADERS = {
  "data/instruments.js":
    '// Файл сгенерирован update_site.py — руками не править (перезапишется при следующем запуске).\n' +
    '// Продукты с "src": "sales" добавлены через админку и сохраняются при перегенерации.\n',
  "data/offerings.js":
    '// ТЕКУЩИЕ РАЗМЕЩЕНИЯ (первичный рынок): выпуски, которые размещаем сейчас или готовим.\n' +
    '// Файл может обновляться автоматикой (админка сейлзов) — тело window.OFFERINGS должно\n' +
    '// оставаться СТРОГИМ JSON (двойные кавычки, без комментариев внутри). Новый выпуск = объект\n' +
    '// в НАЧАЛО items[]. status: "upcoming" | "live". Материалы кладём в docs/.\n',
  "data/digest.js":
    '// Данные дайджеста. Файл может обновляться автоматикой (админка сейлзов) — руками правь аккуратно:\n' +
    '// тело window.DIGEST_ARCHIVE должно оставаться СТРОГИМ JSON (двойные кавычки, без комментариев внутри).\n' +
    '// Новый недельный выпуск = объект в НАЧАЛО issues. issues[0] — всегда актуальный.\n',
  "data/placements.js":
    '// Файл собирается скриптом выгрузки из бэкофиса и админкой сейлзов — руками не править.\n' +
    '// Выпуски с "src": "sales" добавлены через админку; при перегенерации из бэкофиса они\n' +
    '// сохраняются, пока их ISIN не появится в выгрузке (тогда побеждают данные бэкофиса).\n',
};

function renderDataFile(path, obj) {
  const today = new Date().toISOString().slice(0, 10);
  if (path === "data/instruments.js") {
    obj.updated = today;
    return FILE_HEADERS[path] + "// Обновлено: " + today + "\n" +
      "window.SITE_DATA = " + JSON.stringify(obj, null, 2) + ";\n";
  }
  if (path === "data/offerings.js") {
    obj.updated = today;
    return FILE_HEADERS[path] + "window.OFFERINGS = " + JSON.stringify(obj, null, 1) + ";\n";
  }
  if (path === "data/placements.js") {
    obj.updated = today;
    // indent 1 — как пишет fetch_placements.py, чтобы диффы не пухли от переформатирования
    return FILE_HEADERS[path] + "window.PLACEMENTS_DATA = " + JSON.stringify(obj, null, 1) + ";\n";
  }
  // digest
  return FILE_HEADERS[path] + "window.DIGEST_ARCHIVE = " + JSON.stringify(obj, null, 1) + ";\n\n" +
    "// Обратная совместимость: index.html читает window.DIGEST.date (последний выпуск).\n" +
    "window.DIGEST = window.DIGEST_ARCHIVE.issues[0];\n";
}

async function publishItem(env, payload) {
  const { s: section, by, item } = payload;
  const cfg = SUBMIT_SECTIONS[section];
  if (!cfg) throw new Error("bad_section");
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new Error("github_not_configured");
  const branch = env.GITHUB_BRANCH || "main";
  const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/" + cfg.file;

  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
    if (!g.ok) throw new Error("github_get_" + g.status);
    const meta = await g.json();
    const text = b64decodeUtf8(meta.content);
    const obj = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

    let commitMsg, result;
    if (payload.rm) {
      // Размещения ключуются ISIN-ом; снять можно только сейлзовый выпуск —
      // запись бэкофиса всё равно вернулась бы следующей выгрузкой
      const arr = section === "board" ? obj.instruments
        : section === "offering" ? obj.items
        : section === "placement" ? obj.issues
        : obj.issues[0].ideas;
      const kept = section === "placement"
        ? arr.filter((i) => !(i.src === "sales" && i.isin === payload.rm))
        : arr.filter((i) => i.id !== payload.rm);
      if (kept.length === arr.length) throw new Error("not_found");
      if (section === "board") obj.instruments = kept;
      else if (section === "offering") obj.items = kept;
      else if (section === "placement") obj.issues = kept;
      else obj.issues[0].ideas = kept;
      commitMsg = "Админка: снят " + payload.rm + " (от " + by + ")";
      result = { removed: payload.rm };
    } else {
      if (section === "placement") {
        // Дубль ISIN: сейлзовую запись повторная заявка обновляет (исправление опечатки),
        // запись бэкофиса не трогаем — там живые фиксинги и цены
        const dup = obj.issues.find((i) => i.isin === item.isin);
        if (dup && dup.src !== "sales") throw new Error("isin_in_bo");
        obj.issues = obj.issues.filter((i) => !(i.src === "sales" && i.isin === item.isin));
        obj.issues.unshift(item);
      } else if (section === "board") {
        if (payload.ed) {
          // Правка: дополняем запись по НЕПУСТЫМ полям и НЕ трогаем id — иначе
          // персональная ссылка /p/<id>.html, уже разосланная клиентам, умрёт.
          const cur = obj.instruments.find((i) => i.id === item.id);
          if (!cur) throw new Error("not_found");
          if (cur.src !== "sales") throw new Error("not_editable");
          for (const k of Object.keys(item)) {
            const v = item[k];
            if (k === "id" || v === null || v === undefined || v === "") continue;
            cur[k] = v;
          }
          Object.assign(item, cur);
          obj.instruments = obj.instruments.map((i) => (i.id === cur.id ? cur : i));
        } else {
          const taken = new Set(obj.instruments.map((i) => i.id));
          item.id = uniqueId(item.id, taken);
          item.src = "sales";
          obj.instruments.push(item);
        }
      } else if (section === "offering") {
        if (payload.ed) {
          // Правка: ДОПОЛНЯЕМ существующую запись, ничего не удаляя. Пустые поля формы
          // пропускаем — иначе незаполненное поле стирало бы то, что уже опубликовано.
          const cur = obj.items.find((i) => i.id === item.id);
          if (!cur) throw new Error("not_found");
          for (const k of Object.keys(item)) {
            const v = item[k];
            if (k === "id" || v === null || v === undefined || v === "") continue;
            cur[k] = v;
          }
          // Страница превью p/<id>.html собирается из item — после слияния он должен
          // стать ПОЛНОЙ записью, иначе превью потеряет то, чего не было в форме.
          Object.assign(item, cur);
          obj.items = obj.items.map((i) => (i.id === cur.id ? cur : i));
        } else {
          const taken = new Set(obj.items.map((i) => i.id));
          item.id = uniqueId(item.id, taken);
          obj.items.unshift(item);
        }
      } else {
        const ideas = obj.issues[0].ideas;
        const taken = new Set(ideas.map((i) => i.id));
        item.id = uniqueId(item.id, taken);
        ideas.push(item);
      }
      commitMsg = "Админка: " + (payload.ed ? "правка — " : "") + cfg.label + " — " +
        (item.name || item.id) + " (от " + by + ")";
      result = item;
    }

    const put = await fetch(api, {
      method: "PUT", headers: ghHeaders(env),
      body: JSON.stringify({
        message: commitMsg,
        content: b64encodeUtf8(renderDataFile(cfg.file, obj)),
        sha: meta.sha, branch,
      }),
    });
    if (put.ok) {
      // Доска и первичка: создаём/удаляем страницу превью p/<id>.html (у первички редирект
      // на offerings.html#<id>). Не критично для публикации — если сорвётся, продукт всё равно
      // опубликован, а превью подхватится массовой регенерацией (make_product_pages.py).
      if (section === "board" || section === "offering") {
        try {
          if (payload.rm) await deleteFile(env, "p/" + payload.rm + ".html", "Админка: убрана страница превью " + payload.rm, branch);
          else {
            const ogimg = await ogImageFor(env, item.id, branch);
            await upsertFile(env, "p/" + item.id + ".html", productShell(item, section, ogimg), "Админка: страница превью " + item.id, branch);
          }
        } catch (e) { /* превью — необязательное */ }
      }
      return result;
    }
    if (put.status !== 409 && put.status !== 422) throw new Error("github_put_" + put.status);
    // sha устарел (параллельная правка) — перечитываем и пробуем ещё раз
  }
  throw new Error("github_conflict");
}

// Прикрепление эмиссионного документа: байты забираются из KV (там файл ждал
// одобрения) и коммитятся в docs/ + data/placement_docs.js.
// Размер файла по-человечески — теми же единицами, что уже стоят в data/offerings.js
// («965 КБ», «1,7 МБ»): страница показывает эту строку как есть, рядом с типом.
function docSize(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return Math.round(kb) + " КБ";
  return (Math.round(kb / 1024 * 10) / 10).toString().replace(".", ",") + " МБ";
}

// Прикрепление документа к РАЗМЕЩЕНИЮ: байты забираются из KV (там файл ждал
// одобрения) и коммитятся в docs/, затем ссылка дописывается в docs[] этого
// размещения в data/offerings.js. Поле top не ставим: без него документ выводится
// строкой со типом и размером — видно, что качаешь, до нажатия.
async function attachOfferingDoc(env, payload) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new Error("github_not_configured");
  if (!env.POST_KV) throw new Error("kv_not_configured");
  const buf = await env.POST_KV.get(payload.k, "arrayBuffer");
  // Ключ живёт неделю: если модерация затянулась, файл просят загрузить заново
  if (!buf) throw new Error("файл устарел, попросите загрузить заново");
  const bytes = new Uint8Array(buf);
  const branch = env.GITHUB_BRANCH || "main";

  // 1) сам PDF (перезапись легальна: свежая версия документа заменяет старую)
  {
    const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/" + payload.file;
    let sha;
    const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
    if (g.ok) sha = (await g.json()).sha;
    const body = { message: "Админка: документ " + payload.file.split("/").pop() + " (от " + payload.by + ")",
                   content: b64encodeBytes(bytes), branch };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify(body) });
    if (!put.ok) throw new Error("doc_put_" + put.status);
  }

  // 2) ссылка в docs[] нужного размещения
  const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/data/offerings.js";
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
    if (!g.ok) throw new Error("github_get_" + g.status);
    const meta = await g.json();
    const text = b64decodeUtf8(meta.content);
    const obj = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const off = (obj.items || []).find((i) => i.id === payload.oid);
    if (!off) throw new Error("размещения " + payload.oid + " нет на сайте");
    // docs у части размещений лежит как null — массив может понадобиться создать
    if (!Array.isArray(off.docs)) off.docs = [];
    const entry = { name: payload.label, file: payload.file, ext: "PDF", size: payload.size };
    const same = off.docs.findIndex((d) => d && d.file === payload.file);
    if (same >= 0) off.docs[same] = Object.assign({}, off.docs[same], entry);
    else off.docs.push(entry);

    const put = await fetch(api, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify({
      message: "Админка: " + payload.label + " → " + payload.oid + " (от " + payload.by + ")",
      content: b64encodeUtf8(renderDataFile("data/offerings.js", obj)), sha: meta.sha, branch }) });
    if (put.ok) {
      try { await env.POST_KV.delete(payload.k); } catch (e) {}   // файл уже в репозитории
      return;
    }
    if (put.status !== 409 && put.status !== 422) throw new Error("github_put_" + put.status);
    // sha устарел (параллельная правка) — перечитываем и пробуем ещё раз
  }
  throw new Error("github_conflict");
}

async function attachPlacementDoc(env, payload) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new Error("github_not_configured");
  if (!env.POST_KV) throw new Error("kv_not_configured");
  const buf = await env.POST_KV.get(payload.k, "arrayBuffer");
  // Ключ живёт неделю: если модерация затянулась, файл просят загрузить заново
  if (!buf) throw new Error("файл устарел, попросите загрузить заново");
  const bytes = new Uint8Array(buf);

  const branch = env.GITHUB_BRANCH || "main";
  // 1) сам PDF (перезапись легальна: свежая версия документа заменяет старую)
  {
    const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/" + payload.file;
    let sha;
    const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
    if (g.ok) sha = (await g.json()).sha;
    const body = { message: "Админка: документ " + payload.file.split("/").pop() + " (от " + payload.by + ")",
                   content: b64encodeBytes(bytes), branch };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify(body) });
    if (!put.ok) throw new Error("doc_put_" + put.status);
  }
  // 2) запись в data/placement_docs.js — по ней паспорт выпуска показывает ссылки
  const api = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/data/placement_docs.js";
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await fetch(api + "?ref=" + branch, { headers: ghHeaders(env) });
    if (!g.ok) throw new Error("github_get_" + g.status);
    const meta = await g.json();
    const text = b64decodeUtf8(meta.content);
    const obj = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const list = obj[payload.isin] || (obj[payload.isin] = []);
    const same = list.find((d) => d.file === payload.file);
    if (same) same.name = payload.label;
    else list.push({ name: payload.label, file: payload.file });
    const body = "// Материалы по выпускам (КУВ/КИД), сопоставлены по ISIN. Обновляется скриптом и админкой сейлзов.\n" +
      "window.PLACEMENT_DOCS = " + JSON.stringify(obj, null, 1) + ";\n";
    const put = await fetch(api, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify({
      message: "Админка: " + payload.label + " → " + payload.isin + " (от " + payload.by + ")",
      content: b64encodeUtf8(body), sha: meta.sha, branch }) });
    if (put.ok) {
      try { await env.POST_KV.delete(payload.k); } catch (e) {}   // файл уже в репозитории
      return;
    }
    if (put.status !== 409 && put.status !== 422) throw new Error("github_put_" + put.status);
    // sha устарел (параллельная правка) — перечитываем и пробуем ещё раз
  }
  throw new Error("github_conflict");
}

// --- (опц.) Вебхук бота: клиент нажал «Написать в Telegram» ---
// Кому бот доверяет генерацию постов: Руслан плюс сейлзы из ANALYST_CHAT_ID
// (список через запятую). Свой chat_id человек узнаёт командой /id.
function trustedIds(env) {
  return [env.ADMIN_CHAT_ID].concat(String(env.ANALYST_CHAT_ID || "").split(","))
    .map((s) => String(s || "").trim()).filter(Boolean);
}

async function handleTelegram(request, env, ctx) {
  if (env.WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let update;
  try { update = await request.json(); } catch { return new Response("ok"); }

  // --- Кнопки модерации админки (✅ Опубликовать / ❌ Отклонить) ---
  const cb = update.callback_query;
  if (cb) {
    const answer = (textMsg, alert) => tg(env, "answerCallbackQuery",
      { callback_query_id: cb.id, text: textMsg || "", show_alert: !!alert });

    // «🔁 Пересобрать» под утренним постом — доступно отправителям статьи (Руслан и
    // сейлзы из ANALYST_CHAT_ID). Статья лежит в KV сутки; дедуп-память сама подставит
    // другие продукты. Ветка ДО модераторской проверки: кнопку жмёт не только Руслан.
    if (cb.data === "morn") {
      if (!trustedIds(env).includes(String(cb.from && cb.from.id))) {
        await answer("Недостаточно прав"); return new Response("ok");
      }
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      let article = null;
      if (env.POST_KV && chatId != null) {
        try { article = await env.POST_KV.get("morning:article:" + chatId); } catch (e) {}
      }
      if (!article) { await answer("Статья уже устарела — пришлите её боту заново.", true); return new Response("ok"); }
      await answer("Собираю заново…");
      // Два LLM-вызова держали бы вебхук открытым до минуты — Telegram счёл бы это
      // таймаутом и прислал update повторно (дубль). Отвечаем сразу, работаем после.
      const rejob = sendMorningDraft(env, article, chatId);
      if (ctx) ctx.waitUntil(rejob); else await rejob;
      return new Response("ok");
    }

    // «📢 В канал» — бот публикует утренний пост сам, с выключенным превью.
    // Копипаста так не умеет: свойство «без превью» не переносится с текстом,
    // клиент отправителя строит карточку заново. Доступ — тем же доверенным.
    if (cb.data === "mpub") {
      if (!trustedIds(env).includes(String(cb.from && cb.from.id))) {
        await answer("Недостаточно прав"); return new Response("ok");
      }
      if (!env.CHANNEL_ID) { await answer("Канал не настроен (CHANNEL_ID)", true); return new Response("ok"); }
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      let post = null;
      if (env.POST_KV && chatId != null) {
        try {
          // сперва версия, привязанная к этому сообщению; общий ключ — для старых постов
          post = await env.POST_KV.get("morning:post:" + chatId + ":" + cb.message.message_id);
          if (!post) post = await env.POST_KV.get("morning:post:" + chatId);
        } catch (e) {}
      }
      if (!post) { await answer("Пост устарел — пересоберите и публикуйте заново.", true); return new Response("ok"); }
      const r = await tg(env, "sendMessage", { chat_id: env.CHANNEL_ID, text: post, parse_mode: "HTML",
        link_preview_options: { is_disabled: true } });
      let sentOk = false;
      try { sentOk = (await r.json()).ok === true; } catch (e) {}
      if (!sentOk) { await answer("Не удалось опубликовать — бот админ канала?", true); return new Response("ok"); }
      // Кнопку публикации убираем — защита от случайного двойного тапа
      await tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: "✅ Опубликовано", callback_data: "noop" }]] } });
      await answer("Опубликовано в канал ✅");
      return new Response("ok");
    }
    // «🌐 На сайт» — коммит data/morning.js, колонка «Утро на рынках» на главной.
    // В отличие от «В канал» это НЕ разовая отправка: файл перезаписывается целиком,
    // поэтому повторный тап безопасен и кнопку не гасим — только помечаем.
    if (cb.data === "msite") {
      if (!trustedIds(env).includes(String(cb.from && cb.from.id))) {
        await answer("Недостаточно прав"); return new Response("ok");
      }
      if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) { await answer("GitHub не настроен", true); return new Response("ok"); }
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      let payload = null;
      if (env.POST_KV && chatId != null) {
        try {
          payload = await env.POST_KV.get("morning:site:" + chatId + ":" + cb.message.message_id);
          if (!payload) payload = await env.POST_KV.get("morning:site:" + chatId);
        } catch (e) {}
      }
      if (!payload) { await answer("Данные устарели — пересоберите пост.", true); return new Response("ok"); }
      try {
        const obj = JSON.parse(payload);
        // Новый payload состоит из двух частей (главная + разборы), старый был плоским:
        // в KV сутки могут лежать оба, поэтому понимаем и тот и другой.
        const morning = obj.morning || { date: obj.date, news: obj.news, products: obj.products };
        // Файл без даты для главной хуже, чем файл со вчерашней: свежесть считается
        // по date, и без неё колонка прячет новости совсем. Поэтому дату проставляем
        // здесь в любом случае — даже если в KV лежит payload, собранный старым кодом.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(morning.date || ""))) morning.date = mskDate().key;
        const body = MORNING_FILE_HEAD + "window.MORNING = " + JSON.stringify(morning, null, 1) + ";\n";
        await upsertFile(env, "data/morning.js", body,
          "Главная: утренний обзор за " + morning.date, env.GITHUB_BRANCH || "main");
        // Разборы — отдельным коммитом: если они не лягут, главная уже обновлена,
        // и сейлз должен узнать об этом, а не считать, что выложилось всё.
        let note = "Обзор выложен на главную ✅";
        if (obj.research && Array.isArray(obj.research.items) && obj.research.items.length) {
          try {
            await commitResearchIssue(env, obj.research);
            note = "Обзор на главной, разборы обновлены ✅";
          } catch (e) {
            note = "Главная обновлена, но разборы не легли: " + String((e && e.message) || e).slice(0, 40);
          }
        }
        await tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [[{ text: "✅ На сайте", callback_data: "noop" }]] } });
        await answer(note);
      } catch (e) {
        await answer("Не выложилось: " + String((e && e.message) || e).slice(0, 60), true);
      }
      return new Response("ok");
    }
    // «🔁 Пересобрать» под подборкой для ФИ: тема лежит в KV сутки, дедуп (fi:history)
    // сам подставит другие продукты. Права те же, что у утреннего поста.
    if (cb.data === "fi") {
      if (!trustedIds(env).includes(String(cb.from && cb.from.id))) {
        await answer("Недостаточно прав"); return new Response("ok");
      }
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      let theme = "";
      if (env.POST_KV && chatId != null) {
        try { theme = (await env.POST_KV.get("fi:theme:" + chatId)) || ""; } catch (e) {}
      }
      await answer("Собираю заново…");
      // Вебхук отвечаем сразу: два вызова LLM держали бы его до минуты и Telegram
      // прислал бы update повторно (см. ту же развязку у «morn»).
      const rejob = sendFiDraft(env, theme, chatId);
      if (ctx) ctx.waitUntil(rejob); else await rejob;
      return new Response("ok");
    }

    // «📢 В канал ФИ» — публикует бот, с выключенным превью. Канал отдельный
    // (FI_CHANNEL_ID): в канале агентов эта подборка не к месту.
    if (cb.data === "fipub") {
      if (!trustedIds(env).includes(String(cb.from && cb.from.id))) {
        await answer("Недостаточно прав"); return new Response("ok");
      }
      if (!env.FI_CHANNEL_ID) { await answer("Канал ФИ не настроен (FI_CHANNEL_ID)", true); return new Response("ok"); }
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      let post = null;
      if (env.POST_KV && chatId != null) {
        try {
          post = await env.POST_KV.get("fi:post:" + chatId + ":" + cb.message.message_id);
          if (!post) post = await env.POST_KV.get("fi:post:" + chatId);
        } catch (e) {}
      }
      if (!post) { await answer("Подборка устарела — пересоберите и публикуйте заново.", true); return new Response("ok"); }
      const r = await tg(env, "sendMessage", { chat_id: env.FI_CHANNEL_ID, text: post, parse_mode: "HTML",
        link_preview_options: { is_disabled: true } });
      let sentOk = false;
      try { sentOk = (await r.json()).ok === true; } catch (e) {}
      if (!sentOk) { await answer("Не удалось опубликовать — бот админ канала?", true); return new Response("ok"); }
      await tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: "✅ Опубликовано", callback_data: "noop" }]] } });
      await answer("Опубликовано в канал ФИ ✅");
      return new Response("ok");
    }
    if (cb.data === "noop") { await answer(""); return new Response("ok"); }

    // жмёт кнопки только модератор
    if (!env.ADMIN_CHAT_ID || String(cb.from && cb.from.id) !== String(env.ADMIN_CHAT_ID)) {
      await answer("Недостаточно прав"); return new Response("ok");
    }
    // Карточка-документ (заявка на эмиссионный PDF) несёт payload в caption, не в text
    const msgText = (cb.message && (cb.message.text || cb.message.caption)) || "";
    // ПОСЛЕДНЕЕ вхождение: payload всегда в замыкающем <pre>, а выше в тексте
    // карточки печатаются свободные строки (название партнёра, продукта) — та же
    // подстрока в них уводила парсер и делала карточку нерешаемой.
    const at = msgText.lastIndexOf('{"s":');
    const end = msgText.lastIndexOf("}");
    if (at < 0 || end < at) { await answer("Не нашёл данные заявки", true); return new Response("ok"); }
    let payload;
    try { payload = JSON.parse(msgText.slice(at, end + 1)); } catch { await answer("Данные повреждены", true); return new Response("ok"); }
    const isDoc = payload.s === "pdoc" || payload.s === "odoc";
    const label = payload.s === "pdoc" ? "Документы выпусков"
      : payload.s === "odoc" ? "Документы размещений"
      : payload.s === "deal" || payload.s === "dealrm" ? "Сделки партнёров"
      : payload.s === "partner" ? "Партнёры"
      : (SUBMIT_SECTIONS[payload.s] || {}).label || payload.s;
    const title = payload.s === "pdoc" ? payload.isin + " · " + (payload.label || "")
      : payload.s === "odoc" ? payload.oid + " · " + (payload.label || "")
      : payload.s === "deal" ? payload.ref + " · " + ((payload.d && payload.d.product) || "")
      : payload.s === "dealrm" ? payload.ref + " · " + payload.id
      : payload.s === "partner" ? payload.ref + " · " + ((payload.p && payload.p.name) || "")
      : (payload.item && payload.item.name) || payload.rm || "";
    const editCard = (html) => tg(env, "editMessageText",
      { chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: "HTML", text: html });

    if (cb.data === "rej") {
      // отклонённый документ незачем держать в KV до истечения недели
      if (isDoc && payload.k && env.POST_KV) {
        try { await env.POST_KV.delete(payload.k); } catch (e) {}
      }
      await editCard("❌ <b>Отклонено</b> · " + esc(label) + "\n" + esc(title) + " (от " + esc(payload.by) + ")");
      await reqStatus(env, cb.message.message_id, "rejected");
      await answer("Отклонено");
      return new Response("ok");
    }
    if (cb.data === "pub") {
      try {
        let head, what, tail = "";
        if (payload.s === "deal") {
          // Пишем в тот же ключ KV, что и команда /deal: стол читает список одним get.
          const list = await dealsGet(env, payload.ref);
          list.push(payload.d);
          await dealsPut(env, payload.ref, list);
          head = "🤝 <b>Сделка записана</b> · ";
          what = title;
        } else if (payload.s === "dealrm") {
          const list = (await dealsGet(env, payload.ref)).filter(function (x) { return x.id !== payload.id; });
          await dealsPut(env, payload.ref, list);
          head = "🗑 <b>Сделка снята</b> · ";
          what = title;
        } else if (payload.s === "partner") {
          // Перепроверка при ✅: между заявкой и решением метку могли занять
          // (вторая такая же карточка, ключ в PARTNER_KEYS), а у освободившейся
          // метки могла остаться книга сделок — слепая запись перезаписала бы
          // реквизиты или отдала новому контрагенту чужие вознаграждения.
          // Занятость — про ЧУЖУЮ метку. Свои же реквизиты (первое ✅ записало
          // pinfo, а выдача ключа упала) не должны выглядеть занятостью: иначе
          // повтор отвечает «метка занята», хотя партнёр заведён и сидит без входа.
          const already = await pinfoGet(env, payload.ref);
          const mine = already && JSON.stringify(already) === JSON.stringify(payload.p);
          if ((already && !mine) || knownRefs(env).includes(payload.ref)) {
            throw new Error("метка «" + payload.ref + "» уже занята — партнёр не заведён");
          }
          if ((await dealsGet(env, payload.ref)).length) {
            throw new Error("под меткой «" + payload.ref + "» уже лежат сделки — партнёр не заведён");
          }
          // Тот же ключ, что у команды /partner: стол и админка читают pinfo.
          await env.POST_KV.put("pinfo:" + payload.ref, JSON.stringify(payload.p));
          pinfoInvalidate();
          // Ключ входа выдаётся сразу: в KV — только его хэш, сам ключ показываем
          // здесь и один раз сейлзу в админке. В Cloudflare заходить не нужно.
          const issued = await issueDeskKey(env, payload.ref, payload.by);
          head = "🆕 <b>Партнёр заведён</b> · ";
          what = title + " — сделки можно записывать сразу";
          tail = "\n\n<b>Вход в рабочий стол</b>\nID: <code>" + esc(payload.ref) + "</code>\n" +
                 "Ключ: <code>" + esc(issued) + "</code>\n" +
                 "<i>Ключ показан один раз. Сейлз может забрать его в админке двое суток; " +
                 "потерялся — перевыпустите командой /partnerkey " + esc(payload.ref) + "</i>";
        } else if (isDoc) {
          if (payload.s === "odoc") await attachOfferingDoc(env, payload);
          else await attachPlacementDoc(env, payload);
          head = "📎 <b>Прикреплено</b> · ";
          what = title;
        } else {
          const published = await publishItem(env, payload);
          head = payload.rm ? "🗑 <b>Снято</b> · " : payload.ed ? "✏️ <b>Правка применена</b> · " : "✅ <b>Опубликовано</b> · ";
          what = payload.rm ? payload.rm : (published.name || published.id);
        }
        // Сделки и партнёры живут в KV — действуют сразу, сайт-пересборка ни при чём.
        const kvOnly = payload.s === "deal" || payload.s === "dealrm" || payload.s === "partner";
        await editCard(head + esc(label) + "\n" + esc(what) + " (от " + esc(payload.by) + ")" +
                       (kvOnly ? "" : "\nСайт обновится через 1–3 минуты.") + tail);
        await reqStatus(env, cb.message.message_id, "published");
        await answer(payload.rm ? "Снято" : payload.s === "partner" ? "Заведено" : "Опубликовано");
      } catch (e) {
        await answer("Ошибка: " + String(e && e.message || e).slice(0, 150), true);
      }
      return new Response("ok");
    }
    await answer("");
    return new Response("ok");
  }

  const msg = update.message;
  if (msg && msg.text) {
    const from = msg.from || {};
    const who = (from.username ? "@" + from.username : [from.first_name, from.last_name].filter(Boolean).join(" ")) || from.id;

    // Свой chat_id — чтобы Руслан добавил человека в ANALYST_CHAT_ID без гаданий.
    // Отвечаем только в личке: в группах команда создавала бы шум.
    if (msg.text.startsWith("/id")) {
      if (msg.chat && msg.chat.type === "private") {
        await tg(env, "sendMessage", { chat_id: msg.chat.id,
          text: "Ваш chat_id: " + msg.chat.id + "\nПередайте его Руслану — он включит вам доступ к утренним постам." });
      }
      return new Response("ok");
    }

    // Утренняя статья: длинный текст в личке от доверенного отправителя (Руслан или
    // любой из списка ANALYST_CHAT_ID, через запятую) → готовый пост ОБРАТНО отправителю,
    // он сам публикует в канал. Порог 600 знаков отделяет статью от обычных сообщений.
    const trusted = trustedIds(env);
    if (trusted.includes(String(from.id)) && msg.chat && msg.chat.type === "private" &&
        !msg.text.startsWith("/") && msg.text.length >= 600) {
      await tg(env, "sendMessage", { chat_id: msg.chat.id,
        text: "⏳ Понял, это утренний обзор. Собираю пост…" });
      // См. комментарий у «Пересобрать»: вебхук отвечает сразу, генерация — после ответа
      const job = sendMorningDraft(env, msg.text, msg.chat.id);
      if (ctx) ctx.waitUntil(job); else await job;
      return new Response("ok");
    }

    // ---- Ключ сводного кабинета: /bosskey. ТОЛЬКО Руслан.
    if (/^\/bosskey(?:@\w+)?(?:\s|$)/.test(msg.text)) {
      const isAdmin = env.ADMIN_CHAT_ID && String(from.id) === String(env.ADMIN_CHAT_ID);
      if (!isAdmin || !msg.chat || msg.chat.type !== "private") return new Response("ok");
      const say = function (t) {
        return tg(env, "sendMessage", { chat_id: msg.chat.id, text: t,
                                        parse_mode: "HTML", disable_web_page_preview: true });
      };
      if (!env.POST_KV) {
        await say("Хранилище (POST_KV) не подключено — ключ записать некуда.");
        return new Response("ok");
      }
      const bk = makeDeskKey();
      await env.POST_KV.put("bkey:main", JSON.stringify({ h: await keyHash("boss", bk), ts: Date.now() }));
      await say("<b>Ключ сводного кабинета</b>\n<code>" + esc(bk) + "</code>\n\n" +
                "Вход: <b>invest.rumberg.ru/boss.html</b>\n" +
                "<i>Прежний ключ перестаёт работать (хранилище обновляется до минуты). " +
                "Кабинет показывает сделки, вознаграждение и активность ВСЕХ агентов — " +
                "ключ никому не передавайте.</i>");
      return new Response("ok");
    }

    // ---- Реквизиты партнёров: /partner, /partners, /partnerrm. ТОЛЬКО Руслан.
    // Хранятся в KV, а не в репозитории: репозиторий публичный, список партнёров
    // с ИНН/ОГРН в него попадать не должен.
    if (/^\/partners?(?:@\w+)?(?:\s|$)/.test(msg.text) || /^\/partnerrm(?:@\w+)?(?:\s|$)/.test(msg.text) ||
        /^\/partnerkey(?:@\w+)?(?:\s|$)/.test(msg.text)) {
      const isAdmin = env.ADMIN_CHAT_ID && String(from.id) === String(env.ADMIN_CHAT_ID);
      if (!isAdmin || !msg.chat || msg.chat.type !== "private") return new Response("ok");
      const say = function (t) {
        return tg(env, "sendMessage", { chat_id: msg.chat.id, text: t,
                                        parse_mode: "HTML", disable_web_page_preview: true });
      };
      if (!env.POST_KV) {
        await say("Хранилище (POST_KV) не подключено — реквизиты записать некуда.");
        return new Response("ok");
      }

      // /partnerkey <метка> — перевыпустить ключ входа (прежний перестаёт работать)
      if (/^\/partnerkey/.test(msg.text)) {
        const ref = msg.text.replace(/^\/partnerkey(@\w+)?\s*/, "").trim().toLowerCase();
        if (!ref) {
          await say("Формат: <code>/partnerkey метка</code> — выдать новый ключ входа " +
                    "(прежний сразу перестаёт работать).");
          return new Response("ok");
        }
        if (!(await partnerRefs(env, true)).includes(ref)) {
          await say("Партнёра «" + esc(ref) + "» нет в списке. Посмотреть всех: <code>/partners</code>");
          return new Response("ok");
        }
        const fresh = await issueDeskKey(env, ref, "admin");
        // Ключ из секрета этой командой НЕ гасится: deskLogin проверяет
        // PARTNER_KEYS первым, и утёкшая пара продолжала бы пускать — молчать
        // об этом нельзя, перевыпуск затевают как раз ради такого случая.
        const inSecret = keyPairs(env.PARTNER_KEYS).some(function (x) { return x[0] === ref; });
        await say("<b>Новый ключ входа</b>\nID: <code>" + esc(ref) + "</code>\nКлюч: <code>" +
                  esc(fresh) + "</code>\n\n<i>Прежний выданный ключ перестаёт работать " +
                  "(хранилище обновляется до минуты). Сейлз может забрать этот в админке " +
                  "двое суток.</i>" +
                  (inSecret ? "\n\n⚠️ У метки есть ещё и ключ в секрете <b>PARTNER_KEYS</b> — " +
                              "он продолжает пускать. Уберите пару в Cloudflare." : ""));
        return new Response("ok");
      }

      // /partnerrm <метка> — убрать реквизиты
      if (/^\/partnerrm/.test(msg.text)) {
        const ref = msg.text.replace(/^\/partnerrm(@\w+)?\s*/, "").trim().toLowerCase();
        if (!ref) {
          await say("Формат: <code>/partnerrm метка</code>");
          return new Response("ok");
        }
        await env.POST_KV.delete("pinfo:" + ref);
        // Вместе с реквизитами гасим и вход: иначе ключ продолжал бы пускать на
        // стол партнёра, которого мы только что убрали из реестра.
        await env.POST_KV.delete("pkey:" + ref);
        await env.POST_KV.delete("pshow:" + ref);   // записи прежней схемы, если остались
        pinfoInvalidate();
        await say("Реквизиты партнёра <b>" + esc(ref) + "</b> удалены, ключ входа погашен " +
                  "(хранилище обновляется до минуты). Сделки не тронуты." +
                  (keyPairs(env.PARTNER_KEYS).some(function (x) { return x[0] === ref; })
                    ? "\n\n⚠️ У этой метки есть ещё и ключ в секрете PARTNER_KEYS — уберите его в Cloudflare."
                    : ""));
        return new Response("ok");
      }

      // /partners — что заполнено у всех известных меток
      if (/^\/partners(?:@\w+)?(?:\s|$)/.test(msg.text)) {
        const refs = [...new Set((await partnerRefs(env, true)).concat(knownRefs(env)))];
        if (!refs.length) {
          await say("Партнёров нет — задайте PARTNER_KEYS.");
          return new Response("ok");
        }
        const lines = [];
        for (const ref of refs) {
          const info = await pinfoGet(env, ref);
          lines.push(info ? pinfoText(ref, info) : "<b>" + esc(ref) + "</b>\nреквизиты не заполнены");
        }
        await say(lines.join("\n\n"));
        return new Response("ok");
      }

      // /partner метка | Название | ИНН | ОГРН [| договор ...]
      const line = msg.text.replace(/^\/partner(@\w+)?\s*/, "").trim();
      if (!line) {
        await say("Реквизиты партнёра для рабочего стола.\n\n" +
          "<code>/partner метка | Название | ИНН | ОГРН [| договор № ...]</code>\n\n" +
          "Порядок полей помнить не надо: ИНН, ОГРН и ОГРНИП узнаются по числу цифр " +
          "(10/12, 13, 15), договор — по слову «договор».\n\n" +
          "Пример:\n<code>/partner andrey | ООО «Аркада Капитал» | 7701234567 | 1157746123456 | " +
          "договор П-14 от 03.02.2026</code>\n\n" +
          "Ещё: <code>/partners</code> — у кого что заполнено, " +
          "<code>/partnerkey метка</code> — перевыпустить ключ входа, " +
          "<code>/partnerrm метка</code> — удалить.");
        return new Response("ok");
      }
      const parsed = pinfoParse(env, line, await partnerRefs(env, true));
      if (parsed.error) {
        await say("Не понял: " + esc(parsed.error) + "\n\nПодсказка по формату — просто <code>/partner</code>");
        return new Response("ok");
      }
      await env.POST_KV.put("pinfo:" + parsed.ref, JSON.stringify(parsed.info));
      pinfoInvalidate();
      await say("Реквизиты записаны — партнёр увидит их на столе.\n\n" + pinfoText(parsed.ref, parsed.info));
      return new Response("ok");
    }

    // ---- Сделки партнёров командами: ввод, список, удаление. ТОЛЬКО Руслан
    // (ADMIN_CHAT_ID). С 26.08.2026 сделки заводит и админка (action "deal",
    // без одобрения) — команды остались как ручной канал и для сводки /deals.
    if (/^\/deals?(?:@\w+)?(?:\s|$)/.test(msg.text) || /^\/dealrm(?:@\w+)?(?:\s|$)/.test(msg.text)) {
      const isAdmin = env.ADMIN_CHAT_ID && String(from.id) === String(env.ADMIN_CHAT_ID);
      if (!isAdmin || !msg.chat || msg.chat.type !== "private") return new Response("ok");
      const say = function (t) {
        return tg(env, "sendMessage", { chat_id: msg.chat.id, text: t,
                                        parse_mode: "HTML", disable_web_page_preview: true });
      };
      if (!env.POST_KV) {
        await say("Хранилище (POST_KV) не подключено — сделку записать некуда.");
        return new Response("ok");
      }

      // /dealrm <партнёр> <id> — убрать ошибочную запись
      if (/^\/dealrm/.test(msg.text)) {
        const a = msg.text.replace(/^\/dealrm(@\w+)?\s*/, "").trim().split(/\s+/);
        const ref = (a[0] || "").toLowerCase(), id = a[1] || "";
        if (!ref || !id) {
          await say("Формат: <code>/dealrm партнёр id</code>");
          return new Response("ok");
        }
        const list = await dealsGet(env, ref);
        const keep = list.filter(function (x) { return x.id !== id; });
        if (keep.length === list.length) {
          await say("Сделки <code>" + esc(id) + "</code> у «" + esc(ref) + "» нет.");
          return new Response("ok");
        }
        await dealsPut(env, ref, keep);
        await say("Удалено. У «" + esc(ref) + "» осталось сделок: " + keep.length);
        return new Response("ok");
      }

      // /deals [партнёр] — список
      if (/^\/deals/.test(msg.text)) {
        const ref = msg.text.replace(/^\/deals(@\w+)?\s*/, "").trim().toLowerCase();
        if (!ref) {
          const rows = [];
          for (const r of [...new Set((await partnerRefs(env, true)).concat(knownRefs(env)))]) {
            const list = await dealsGet(env, r);
            if (!list.length) continue;
            const t = dealTotals(list);
            rows.push("<b>" + esc(r) + "</b> — сделок " + list.length + ", " +
              Object.keys(t).map(function (c) {
                return "начислено " + dealMoney(t[c].accrued, c) + ", выплачено " + dealMoney(t[c].paid, c);
              }).join("; "));
          }
          await say(rows.length
            ? "<b>Сделки по партнёрам</b>\n\n" + rows.join("\n")
            : "Сделок пока не заведено ни у кого.\n\nФормат ввода:\n" +
              "<code>/deal партнёр | продукт | ДД.ММ.ГГГГ | объём | вознаграждение</code>");
          return new Response("ok");
        }
        const list = await dealsGet(env, ref);
        if (!list.length) {
          await say("У «" + esc(ref) + "» сделок нет.");
          return new Response("ok");
        }
        const body = list.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })
          .slice(0, 30).map(dealLine).join("\n");
        await say("<b>" + esc(ref) + "</b> — сделок " + list.length + "\n" +
                  dealTotalsText(dealTotals(list)) + "\n\n" + body +
                  (list.length > 30 ? "\n\n…показаны последние 30" : ""));
        return new Response("ok");
      }

      // /deal партнёр | продукт | дата | объём | вознаграждение [| выплачено] [| USD]
      const line = msg.text.replace(/^\/deal(@\w+)?\s*/, "").trim();
      if (!line) {
        await say("<b>Ввод сделки партнёра</b>\n\n" +
          "<code>/deal партнёр | продукт | ДД.ММ.ГГГГ | объём | вознаграждение</code>\n\n" +
          "Необязательно, в любом месте строки: <code>ISIN</code> выпуска, <code>выплачено</code> " +
          "(по умолчанию «начислено») и валюта <code>USD</code>, <code>EUR</code>, " +
          "<code>CNY</code> (по умолчанию рубли).\n\nПример:\n" +
          "<code>/deal andrey | Дисконтная облигация на ВЭБ.РФ · 3 года | 20.08.2026 | 5 000 000 | 112 500</code>\n\n" +
          "Известные партнёры: " + (knownRefs(env).join(", ") || "ни одного — задайте PARTNER_KEYS") +
          "\nЕщё: <code>/deals</code> — все, <code>/deals партнёр</code> — его сделки, " +
          "<code>/dealrm партнёр id</code> — удалить.");
        return new Response("ok");
      }
      const parsed = dealParse(env, line, await partnerRefs(env, true));
      if (parsed.error) {
        await say("Не понял: " + esc(parsed.error) + "\n\nПодсказка по формату — просто <code>/deal</code>");
        return new Response("ok");
      }
      const list = await dealsGet(env, parsed.ref);
      list.push(parsed.deal);
      await dealsPut(env, parsed.ref, list);
      await say("✅ Записано партнёру <b>" + esc(parsed.ref) + "</b>\n\n" + dealLine(parsed.deal) +
        "\n\n" + dealTotalsText(dealTotals(list)) +
        "\n\nОшиблись — <code>/dealrm " + esc(parsed.ref) + " " + esc(parsed.deal.id) + "</code>");
      return new Response("ok");
    }

    // Команда админа: сгенерировать черновик поста по запросу. Формат: «/post [тема]».
    // Только Руслан (ADMIN_CHAT_ID); чужие /post игнорируем и в группу НЕ пересылаем.
    if (msg.text.startsWith("/post")) {
      if (env.ADMIN_CHAT_ID && String(from.id) === String(env.ADMIN_CHAT_ID)) {
        const theme = msg.text.replace(/^\/post(@\w+)?\s*/, "").trim().slice(0, 300);
        await sendPostDraft(env, theme);
      }
      return new Response("ok");
    }

    // «/fi [тема]» — подборка 5 непересекающихся продуктов для финансовых институтов.
    // Доступна доверенным, ответ уходит вызвавшему в личку: он сам решает, кому слать.
    if (/^\/fi(?:@\w+)?(?:\s|$)/.test(msg.text)) {
      if (trusted.includes(String(from.id)) && msg.chat && msg.chat.type === "private") {
        const theme = msg.text.replace(/^\/fi(@\w+)?\s*/, "").trim().slice(0, 300);
        await tg(env, "sendMessage", { chat_id: msg.chat.id, text: "⏳ Собираю подборку для ФИ…" });
        const job = sendFiDraft(env, theme, msg.chat.id);
        if (ctx) ctx.waitUntil(job); else await job;
      }
      return new Response("ok");
    }

    if (msg.text.startsWith("/start")) {
      const payload = msg.text.split(" ")[1] || "";
      await tg(env, "sendMessage", {
        chat_id: msg.chat.id,
        text: "Здравствуйте! Спасибо за интерес" + (payload ? " к продукту " + esc(payload) : "") +
              ". Напишите ваш вопрос — менеджер ответит в ближайшее время.",
      });
      await tg(env, "sendMessage", {
        chat_id: env.CHAT_ID, parse_mode: "HTML",
        text: "🟠 <b>Лид из Telegram-бота</b>\nКлиент: " + esc(who) +
              (payload ? "\nПродукт: " + esc(payload) : ""),
      });
    } else {
      // Пересылаем сообщение клиента в группу продаж.
      await tg(env, "sendMessage", {
        chat_id: env.CHAT_ID, parse_mode: "HTML",
        text: "💬 <b>Сообщение от клиента</b> (" + esc(who) + "):\n" + esc(msg.text),
      });
    }
  }
  return new Response("ok");
}
