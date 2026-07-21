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
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/lead" && request.method === "POST") return handleLead(request, env, cors);
    if (url.pathname === "/chat" && request.method === "POST") return handleChat(request, env, cors);
    if (url.pathname === "/submit" && request.method === "POST") return handleSubmit(request, env, cors);
    if (url.pathname === "/tg" && request.method === "POST") return handleTelegram(request, env);

    return new Response("OK", { status: 200, headers: cors });
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

Также простыми словами объясняешь, как устроены структурные продукты (дисконтные облигации, ноты с защитой капитала, автоколлы, барьерные ноты, call-spread, варранты): профиль выплаты, риск, срок.

Разделы сайта: «Дайджест» — инвестидея недели; «На размещении» — выпуски, которые размещаем сейчас; «Текущие продукты» (доска) — прайсинг; «Размещённые выпуски» — что уже сделали, с документами; «Библиотека» — как работают продукты. Заинтересовался продуктом — предложи нажать «Обсудить продукт» на странице или кнопку «Обсудить с Румбергом» в чате: заявка уйдёт менеджеру.

Строгие правила:
- НЕ давай индивидуальных инвестиционных рекомендаций и прогнозов доходности, не советуй «покупать/продавать». Мягко поясни, что не даёшь инвестсоветов, и предложи менеджера.
- Конкретные цифры бери только из каталога; вне каталога — не выдумывай.
- При уместности напоминай: информация для квалифицированных инвесторов и не является индивидуальной инвестиционной рекомендацией.
- Отвечай только про структурные продукты и этот сайт; на постороннее вежливо возвращай к теме.`;

// Живой каталог с сайта (кэш в изоляте, TTL 5 мин). Парсим сгенерированные JSON-файлы.
let CATALOG = { text: "", at: 0 };

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
  if (CATALOG.text && now - CATALOG.at < 5 * 60 * 1000) return CATALOG.text;
  const base = (env.SITE_BASE || "https://invest.rumberg.ru/").replace(/\/?$/, "/");
  const [site, plc] = await Promise.all([
    fetchDataObj(base + "data/instruments.js"),
    fetchDataObj(base + "data/placements.js"),
  ]);
  const lines = [];
  const instr = (site && site.instruments) || [];
  if (instr.length) {
    lines.push("ТЕКУЩИЕ ПРОДУКТЫ (доска, можно предложить сейчас):");
    for (const p of instr) {
      lines.push("- " + [p.name, p.underlying && "базовый актив: " + p.underlying,
        p.quote != null && "цена " + p.quote + "%"].filter(Boolean).join(" · "));
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
  CATALOG = { text: lines.join("\n"), at: now };
  return CATALOG.text;
}

async function handleChat(request, env, cors) {
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
  let catalog = "";
  try { catalog = await buildCatalog(env); } catch (e) { catalog = ""; }
  const system = SYSTEM_PROMPT +
    (catalog ? "\n\n=== АКТУАЛЬНЫЙ КАТАЛОГ ===\n" + catalog : "") +
    (pageTitle ? `\n\nСейчас клиент на странице: «${pageTitle}»${pageUrl ? " (" + pageUrl + ")" : ""}.` : "");

  const provider = (env.CHAT_PROVIDER || "yandex").toLowerCase();
  let reply;
  try {
    if (provider === "deepseek") reply = await callDeepSeek(system, messages, env);
    else if (provider === "claude") reply = await callClaude(system, messages, env);
    else reply = await callYandex(system, messages, env);
  } catch (e) {
    const msg = String((e && e.message) || e);
    return json({ ok: false, error: msg }, msg === "not_configured" ? 503 : 502, cors);
  }
  return json({ ok: true, reply: reply || "Извините, не удалось сформировать ответ." }, 200, cors);
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
async function callDeepSeek(system, messages, env) {
  const key = (env.DEEPSEEK_API_KEY || "").trim();
  if (!key) throw new Error("not_configured");
  const model = (env.DEEPSEEK_MODEL || "deepseek-chat").trim();
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }].concat(
        messages.map((m) => ({ role: m.role, content: m.content }))
      ),
      temperature: 0.3, max_tokens: 800, stream: false,
    }),
  });
  if (!r.ok) throw new Error("upstream_" + r.status);
  const data = await r.json();
  const c = data && data.choices && data.choices[0];
  return ((c && c.message && c.message.content) || "").trim();
}

// Claude (Anthropic) — запасной провайдер (CHAT_PROVIDER=claude)
async function callClaude(system, messages, env) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("not_configured");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: env.CHAT_MODEL || "claude-haiku-4-5", max_tokens: 500, system, messages }),
  });
  if (!r.ok) throw new Error("upstream_" + r.status);
  const data = await r.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
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
        if (["call", "callcap", "digital", "protected"].includes(t)) {
          const p = { type: t };
          for (const nk of ["capPct", "premiumPct", "couponPct", "barrierPct"]) {
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

// --- Персональные превью продуктов: p/<id>.html с og-тегами + редирект на карточку ---
// Скрапер превью (Telegram) не исполняет JS, поэтому нужна статичная страница на продукт.
// Шаблон 1:1 с make_product_pages.py — чтобы массовая регенерация не давала лишних диффов.
const SHELL_BASE = "https://invest.rumberg.ru";
const SHELL_TYPE_LABEL = { discount: "Дисконтная облигация", protection: "Нота с защитой капитала", warrant: "Варрант" };
function shellEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function shellDesc(item) {
  const tl = SHELL_TYPE_LABEL[item.type] || "Структурный продукт";
  const ua = item.underlying || "";
  const parts = [tl + (ua ? " на " + ua : "")];
  if (item.quote != null) parts.push("котировка " + String(item.quote).replace(".", ",") + "% от номинала");
  parts.push("Rumberg — структурные продукты для квалифицированных инвесторов");
  return parts.join(" · ");
}
function productShell(item) {
  const id = item.id, title = shellEsc(item.name || id), desc = shellEsc(shellDesc(item)), B = SHELL_BASE;
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
    '<meta property="og:image" content="' + B + '/og-cover.png">',
    '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Rumberg — структурные продукты">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#0B0C10">',
    '<link rel="canonical" href="' + B + '/p/' + id + '.html">',
    '<script>location.replace("/instrument.html?id=' + id + '");</script>',
    "<style>html,body{margin:0;height:100%}body{background:#0B0C10;color:rgba(242,243,247,.6);font-family:'Onest',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;gap:8px}a{color:#EE7D1B}</style>",
    '</head>',
    '<body>Открываем продукт… <a href="/instrument.html?id=' + id + '">перейти вручную</a></body>',
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
      // Продукты доски: создаём/удаляем страницу превью p/<id>.html. Не критично для публикации —
      // если сорвётся, продукт всё равно опубликован (превью подхватится при массовой регенерации).
      if (section === "board") {
        try {
          if (payload.rm) await deleteFile(env, "p/" + payload.rm + ".html", "Админка: убрана страница превью " + payload.rm, branch);
          else await upsertFile(env, "p/" + item.id + ".html", productShell(item), "Админка: страница превью " + item.id, branch);
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
