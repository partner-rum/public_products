// Cloudflare Worker: заявки с сайта + Telegram-бот → лиды в Telegram менеджеру/группе продаж.
//
// Секреты (задаются командой `wrangler secret put ...`, В КОД НЕ ПОПАДАЮТ):
//   BOT_TOKEN         — токен бота от @BotFather
//   CHAT_ID           — id чата/группы продаж, куда падают заявки (напр. -1001234567890)
//   WEBHOOK_SECRET    — (опц.) секрет вебхука Telegram; если задан — проверяется заголовок
//   ALLOW_ORIGIN      — (опц.) домен сайта для CORS, напр. https://partner-rum.github.io. По умолчанию "*"
//   CHAT_PROVIDER     — (опц.) провайдер ИИ для /chat: "yandex" (по умолчанию) или "claude".
//   YANDEX_API_KEY    — (yandex) API-ключ сервисного аккаунта Yandex Cloud (роль ai.languageModels.user).
//   YANDEX_FOLDER_ID  — (yandex) идентификатор каталога (folder) в Yandex Cloud.
//   YANDEX_MODEL      — (опц.) модель Yandex, по умолчанию "yandexgpt/latest" (последняя Pro); напр. "yandexgpt/rc".
//   ANTHROPIC_API_KEY — (claude, запасной) ключ Claude API. Нужен только при CHAT_PROVIDER=claude.
//   CHAT_MODEL        — (опц.) модель Claude, по умолчанию claude-haiku-4-5.
//   CHAT_BLOCKED_COUNTRIES — (опц.) страны (ISO-2, через запятую), где AI-чат отключён. По умолчанию ПУСТО
//                            (открыто для всех). Чтобы ограничить — задай "RU" или "RU,BY": тем клиентам
//                            /chat вернёт region_unavailable, и виджет предложит Telegram.
//
// Маршруты:
//   POST /lead  — форма-заявка с сайта  → сообщение в CHAT_ID
//   POST /chat  — сообщение чат-ассистента → Claude API → ответ обратно на сайт
//   POST /tg    — (опц.) вебхук Telegram: /start <id> приветствует клиента и шлёт лид в CHAT_ID,
//                 обычные сообщения бот пересылает в CHAT_ID
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
  if (!contact) return json({ ok: false, error: "no_contact" }, 422, cors);

  const text =
    "🟠 <b>Заявка с сайта</b>\n" +
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
- спрашивают текущие продукты (в т.ч. по базовому активу — «на ОФЗ», «на индекс», «в долларах») — найди подходящие в разделе ТЕКУЩИЕ ПРОДУКТЫ и перечисли компактным списком: название · базовый актив · цена · срок;
- дают ISIN или название выпуска — найди его в разделе РАЗМЕЩЁННЫЕ ВЫПУСКИ и расскажи параметры (базовый актив, купон/участие, срок, Bid если есть);
- если в каталоге ничего не нашлось — честно скажи, что не нашёл, и предложи уточнить у менеджера. НИКОГДА не выдумывай ISIN, цены, купоны или выпуски, которых нет в каталоге.

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
  const base = (env.SITE_BASE || "https://partner-rum.github.io/public_products/").replace(/\/?$/, "/");
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
        p.quote != null && "цена " + p.quote + "%", p.expiry && "срок до " + p.expiry,
        "id " + p.id].filter(Boolean).join(" · "));
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
        pay, i.maturity && "погашение " + i.maturity,
        i.bid != null && "Bid " + i.bid + "%"].filter(Boolean).join(" · "));
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
    reply = provider === "claude" ? await callClaude(system, messages, env) : await callYandex(system, messages, env);
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

// --- (опц.) Вебхук бота: клиент нажал «Написать в Telegram» ---
async function handleTelegram(request, env) {
  if (env.WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let update;
  try { update = await request.json(); } catch { return new Response("ok"); }

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
