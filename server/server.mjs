// Запуск bot/worker.js на своём сервере БЕЗ переписывания кода.
//
// Ключевая мысль переноса: воркер — обычный ES-модуль с fetch(request, env, ctx),
// а единственный платформенный вызов в нём — crypto.subtle, который в Node 24 есть.
// Поэтому мы не переносим 4837 строк по частям (это был бы главный источник
// регрессий), а даём тому же коду окружение: свой KV на SQLite, свой лимитер,
// свой waitUntil. Так и тесты воркера (morning_test, deals_test, boss_test и др.)
// продолжают проверять ровно тот код, что работает в бою.
//
// Запуск: node server/server.mjs   (порт из env PORT, по умолчанию 8080)
// Воркер импортируется ПРЯМО из bot/worker.js — тот же файл, что уезжает
// в Cloudflare. Копии нет намеренно: копия однажды отстала бы от репозитория,
// и сервер тихо работал бы по старому коду.
// Секреты — через systemd EnvironmentFile, в код не попадают.

import http from "node:http";
import { openKV } from "./kv.mjs";
import worker from "../bot/worker.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";
const DB = process.env.KV_DB || "/var/lib/rumberg/kv.db";

const kvRaw = openKV(DB);

// Воркер местами глотает ошибки хранилища пустым catch (например, активность
// в /boss «необязательна»), и сбой выглядит как «данных нет». Логируем сами:
// печатаем ТОЛЬКО имя метода и ключ/опции, без значений — там реквизиты и ключи.
const kv = new Proxy(kvRaw, {
  get(t, prop) {
    const v = t[prop];
    if (typeof v !== "function") return v;
    return function (...args) {
      try {
        const out = v.apply(t, args);
        if (process.env.KV_TRACE === "1" && prop === "list") {
          Promise.resolve(out).then((r) => console.log("KV.list prefix=" + JSON.stringify(args[0] && args[0].prefix) + " -> " + ((r && r.keys && r.keys.length) || 0) + " ключей")).catch(() => {});
        }
        if (out && typeof out.then === "function") {
          return out.catch((e) => {
            console.error("KV." + String(prop) + " упал:", e && e.message, "| ключ:", JSON.stringify(args[0]));
            throw e;
          });
        }
        return out;
      } catch (e) {
        console.error("KV." + String(prop) + " упал:", e && e.message, "| ключ:", JSON.stringify(args[0]));
        throw e;
      }
    };
  },
});

// Лимитер с интерфейсом биндинга Cloudflare Rate Limiting: воркер зовёт
// env.CHAT_RATE_LIMIT.limit({key}) и ждёт {success}. Считаем в памяти скользящим
// окном: процесс один, делить состояние не с кем.
function makeLimiter(perMinute) {
  const hits = new Map();
  return {
    async limit({ key }) {
      const t = Date.now();
      const arr = (hits.get(key) || []).filter((x) => t - x < 60000);
      arr.push(t);
      hits.set(key, arr);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < 60000)) hits.delete(k);
      return { success: arr.length <= perMinute };
    },
  };
}

const env = {
  ...process.env,
  POST_KV: kv,
  CHAT_RATE_LIMIT: makeLimiter(Number(process.env.RATE_PER_MIN || 15)),
};

function makeCtx() {
  const tasks = [];
  return { ctx: { waitUntil: (p) => { tasks.push(Promise.resolve(p).catch(() => {})); } }, tasks };
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    // Cron воркера (worker.scheduled) — у Cloudflare его дёргает платформа, здесь
    // systemd-таймер стучится на localhost. Снаружи путь недостижим: nginx
    // проксирует только /api/, но адрес всё равно проверяем — защита не должна
    // держаться на одной строчке чужого конфига.
    if (req.url === "/__cron") {
      const ra = req.socket.remoteAddress || "";
      if (!(ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1")) {
        res.statusCode = 403; res.end('{"ok":false,"error":"not_local"}'); return;
      }
      const { ctx, tasks } = makeCtx();
      try {
        await worker.scheduled({ scheduledTime: Date.now(), cron: "" }, env, ctx);
        if (tasks.length) await Promise.allSettled(tasks);
        console.log("cron выполнен за " + (Date.now() - started) + "ms");
        res.statusCode = 200; res.end('{"ok":true}');
      } catch (e) {
        console.error("cron упал:", e && e.stack ? e.stack : e);
        res.statusCode = 500; res.end('{"ok":false}');
      }
      return;
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else if (v != null) headers.set(k, v);
    }
    // Воркер читает IP из CF-Connecting-IP (он так написан для Cloudflare).
    // nginx кладёт реальный адрес клиента в X-Real-IP, потому что подставить
    // CF-Connecting-IP на пути к Cloudflare нельзя — тот отбивает свои служебные
    // заголовки и возвращает 403. Здесь Cloudflare нет, поэтому нормализуем сами:
    // так внутренние лимиты воркера снова различают людей, а его код не меняется.
    const realIp = headers.get("x-real-ip") || req.socket.remoteAddress || "";
    if (realIp) headers.set("cf-connecting-ip", realIp);

    const proto = headers.get("x-forwarded-proto") || "https";
    const host = headers.get("x-forwarded-host") || headers.get("host") || "invest.rumberg.ru";
    const url = proto + "://" + host + req.url;

    const request = new Request(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });

    const { ctx, tasks } = makeCtx();
    const out = await worker.fetch(request, env, ctx);

    res.statusCode = out.status;
    out.headers.forEach((v, k) => res.setHeader(k, v));
    const buf = Buffer.from(await out.arrayBuffer());
    res.end(buf);

    // Фоновые задачи воркера (логи, уведомления, генерация обзора) — у Cloudflare
    // их доживает платформа, здесь дожидаемся сами, уже ответив клиенту.
    if (tasks.length) await Promise.allSettled(tasks);

    if (process.env.LOG_REQUESTS !== "0") {
      console.log(`${req.method} ${req.url} → ${out.status} ${Date.now() - started}ms`);
    }
  } catch (e) {
    console.error("ошибка обработки:", req.method, req.url, e && e.stack ? e.stack : e);
    if (!res.headersSent) { res.statusCode = 500; res.end('{"ok":false,"error":"server_error"}'); }
  }
});

// Обслуживание: KV удаляет истёкшие ключи сам, SQLite — нет.
setInterval(() => {
  try { const n = kvRaw.purgeExpired(); if (n) console.log("очищено истёкших ключей:", n); }
  catch (e) { console.error("очистка не удалась:", e.message); }
}, 3600_000).unref();

server.listen(PORT, HOST, () => console.log(`бэкенд слушает http://${HOST}:${PORT}, база ${DB}`));

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => { server.close(() => { try { kvRaw.close(); } catch {} process.exit(0); }); });
}
