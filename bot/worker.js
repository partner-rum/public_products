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
// Маршруты:
//   POST /lead   — форма-заявка с сайта  → сообщение в CHAT_ID
//   POST /chat   — сообщение чат-ассистента → Claude API → ответ обратно на сайт
//   POST /submit — админка сейлзов: продукт → карточка с кнопками ✅/❌ в ADMIN_CHAT_ID
//   POST /tg     — вебхук Telegram: callback-кнопки модерации (✅ публикует коммитом в GitHub),
//                  /start <id> приветствует клиента и шлёт лид в CHAT_ID, прочее пересылает в CHAT_ID
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
    if (url.pathname === "/chat" && request.method === "POST") return handleChat(request, env, cors, ctx);
    if (url.pathname === "/submit" && request.method === "POST") return handleSubmit(request, env, cors);
    if (url.pathname === "/tg" && request.method === "POST") return handleTelegram(request, env);

    return new Response("OK", { status: 200, headers: cors });
  },

  // Cron Triggers (расписание задаётся в Cloudflare → Workers → Triggers → Cron).
  // Ежедневно генерим 3 короткие идеи постов для канала агентов и шлём Руслану в личку.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendPostDraft(env).catch(() => {}));
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
      lines.push("- [" + p.id + "] " + [p.name, p.underlying && "базовый актив: " + p.underlying,
        p.quote != null && "цена " + p.quote + "%"].filter(Boolean).join(" · "));
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
  CATALOG = { text: lines.join("\n"), at: now, instr, offers, ideas: (idea && idea.ideas) || [] };
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
  const system = SYSTEM_PROMPT +
    (cat.text ? "\n\n=== АКТУАЛЬНЫЙ КАТАЛОГ ===\n" + cat.text : "") +
    (pageTitle ? `\n\nСейчас клиент на странице: «${pageTitle}»${pageUrl ? " (" + pageUrl + ")" : ""}.` : "") +
    (prodCtx ? "\n\n=== ПРОДУКТ, КОТОРЫЙ КЛИЕНТ СЕЙЧАС СМОТРИТ (отвечай в первую очередь про него) ===\n" + prodCtx : "");

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
async function callYandex(system, messages, env) {
  const key = (env.YANDEX_API_KEY || "").trim();
  const folder = (env.YANDEX_FOLDER_ID || "").trim();
  if (!key || !folder) throw new Error("not_configured");
  const model = (env.YANDEX_MODEL || "yandexgpt/latest").trim();
  const body = {
    modelUri: "gpt://" + folder + "/" + model,
    completionOptions: { stream: false, temperature: 0.3, maxTokens: "800" },
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
    }),
  });
  if (opts.stream) return r;   // сырой ответ — его SSE перекладывает streamChat()
  if (!r.ok) throw new Error("upstream_" + r.status);
  const data = await r.json();
  const c = data && data.choices && data.choices[0];
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
  if (p === "yandex") return callYandex(system, messages, env);
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
// Админка сейлзов: /submit → карточка модератору → ✅ коммит в GitHub
// ============================================================================

// Белые списки полей по разделам — в публичные файлы попадает только это.
const SUBMIT_SECTIONS = {
  board: {
    label: "Текущие продукты (доска)",
    file: "data/instruments.js",
    str: ["id", "type", "structure", "name", "underlying", "cls", "uRef", "tenor", "expiry"],
    num: ["spot", "strike", "strike2", "participation", "protectionPct", "cap", "quote", "chg", "minNom"],
    required: ["id", "type", "name", "underlying", "cls", "expiry", "quote"],
  },
  offering: {
    label: "На размещении",
    file: "data/offerings.js",
    str: ["id", "family", "kind", "name", "status", "statusLabel", "teaser", "issuer", "serial",
          "isin", "reference", "currency", "placement", "maturity", "tenor", "venue", "how", "risk"],
    num: ["nominal", "price", "redeem"],
    arr: ["dealers"],
    required: ["id", "family", "kind", "name", "status", "teaser", "issuer", "serial", "price", "how", "risk"],
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
          for (const nk of ["capPct", "premiumPct", "couponPct", "barrierPct", "kuPct", "entryPct", "gainPct", "floorPct"]) {
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
  if (out.id) out.id = out.id.toLowerCase().replace(/[^\w.-]+/g, "-").slice(0, 60);
  const missing = cfg.required.filter((k) => out[k] == null || out[k] === "");
  return { item: out, missing };
}

async function handleSubmit(request, env, cors) {
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
    return json({ ok: true }, 200, cors);
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
  return json({ ok: true }, 200, cors);
}

// --- Публикация: правка data-файла в GitHub через Contents API ---
function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
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

// --- Персональные превью продуктов: p/<id>.html с og-тегами + редирект на карточку ---
// Скрапер превью (Telegram) не исполняет JS, поэтому нужна статичная страница на продукт.
// Шаблон 1:1 с make_product_pages.py — чтобы массовая регенерация не давала лишних диффов.
const SHELL_BASE = "https://invest.rumberg.ru";
const SHELL_TYPE_LABEL = { discount: "Дисконтная облигация", protection: "Облигация с защитой капитала", warrant: "Варрант", booster: "Бустер" };
function shellEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function shellDesc(item) {
  const tl = SHELL_TYPE_LABEL[item.type] || "Структурный продукт";
  const ua = item.underlying || "";
  const parts = [tl + (ua ? " на " + ua : "")];
  if (item.quote != null) {
    // у бустера quote = коэффициент участия, не цена (как в make_product_pages.py)
    parts.push(item.type === "booster"
      ? "коэффициент участия " + String(item.quote).replace(".", ",") + "%"
      : "котировка " + String(item.quote).replace(".", ",") + "% от номинала");
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
    '<script>location.replace("' + target + '");</script>',
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
      const arr = section === "board" ? obj.instruments : section === "offering" ? obj.items : obj.issues[0].ideas;
      const kept = arr.filter((i) => i.id !== payload.rm);
      if (kept.length === arr.length) throw new Error("not_found");
      if (section === "board") obj.instruments = kept;
      else if (section === "offering") obj.items = kept;
      else obj.issues[0].ideas = kept;
      commitMsg = "Админка: снят " + payload.rm + " (от " + by + ")";
      result = { removed: payload.rm };
    } else {
      if (section === "board") {
        const taken = new Set(obj.instruments.map((i) => i.id));
        item.id = uniqueId(item.id, taken);
        item.src = "sales";
        obj.instruments.push(item);
      } else if (section === "offering") {
        const taken = new Set(obj.items.map((i) => i.id));
        item.id = uniqueId(item.id, taken);
        obj.items.unshift(item);
      } else {
        const ideas = obj.issues[0].ideas;
        const taken = new Set(ideas.map((i) => i.id));
        item.id = uniqueId(item.id, taken);
        ideas.push(item);
      }
      commitMsg = "Админка: " + cfg.label + " — " + (item.name || item.id) + " (от " + by + ")";
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

// --- (опц.) Вебхук бота: клиент нажал «Написать в Telegram» ---
async function handleTelegram(request, env) {
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
    // жмёт кнопки только модератор
    if (!env.ADMIN_CHAT_ID || String(cb.from && cb.from.id) !== String(env.ADMIN_CHAT_ID)) {
      await answer("Недостаточно прав"); return new Response("ok");
    }
    const msgText = (cb.message && cb.message.text) || "";
    const at = msgText.indexOf('{"s":');
    const end = msgText.lastIndexOf("}");
    if (at < 0 || end < at) { await answer("Не нашёл данные заявки", true); return new Response("ok"); }
    let payload;
    try { payload = JSON.parse(msgText.slice(at, end + 1)); } catch { await answer("Данные повреждены", true); return new Response("ok"); }
    const label = (SUBMIT_SECTIONS[payload.s] || {}).label || payload.s;
    const title = (payload.item && payload.item.name) || payload.rm || "";

    if (cb.data === "rej") {
      await tg(env, "editMessageText", {
        chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: "HTML",
        text: "❌ <b>Отклонено</b> · " + esc(label) + "\n" + esc(title) + " (от " + esc(payload.by) + ")",
      });
      await answer("Отклонено");
      return new Response("ok");
    }
    if (cb.data === "pub") {
      try {
        const published = await publishItem(env, payload);
        const head = payload.rm ? "🗑 <b>Снято</b> · " : "✅ <b>Опубликовано</b> · ";
        const what = payload.rm ? payload.rm : (published.name || published.id);
        await tg(env, "editMessageText", {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: "HTML",
          text: head + esc(label) + "\n" + esc(what) + " (от " + esc(payload.by) + ")\nСайт обновится через 1–3 минуты.",
        });
        await answer(payload.rm ? "Снято" : "Опубликовано");
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

    // Команда админа: сгенерировать черновик поста по запросу. Формат: «/post [тема]».
    // Только Руслан (ADMIN_CHAT_ID); чужие /post игнорируем и в группу НЕ пересылаем.
    if (msg.text.startsWith("/post")) {
      if (env.ADMIN_CHAT_ID && String(from.id) === String(env.ADMIN_CHAT_ID)) {
        const theme = msg.text.replace(/^\/post(@\w+)?\s*/, "").trim().slice(0, 300);
        await sendPostDraft(env, theme);
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
