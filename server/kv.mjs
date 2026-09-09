// Хранилище с интерфейсом Cloudflare KV на встроенном node:sqlite.
//
// Зачем такой интерфейс: перенос идёт из bot/worker.js, где 125 обращений вида
// env.POST_KV.get/put/list/delete. Совпадающий API позволяет переносить функции
// воркера почти дословно — иначе каждая из них правилась бы вручную, а это
// главный источник регрессий при переезде.
//
// Поддержано ровно то, что воркер реально использует (проверено grep-ом):
//   get(key)                        → строка или null
//   put(key, value, {expirationTtl, metadata})
//   delete(key)
//   list({prefix, limit, cursor})   → {keys:[{name, metadata, expiration}], list_complete, cursor}
// Плюс бинарные значения: PDF на модерации (pdoc:*) весит до 15 МБ, и в KV он
// лежит байтами — поэтому value хранится в колонке с динамическим типом SQLite,
// а get умеет отдать Buffer по запросу.

import { DatabaseSync } from "node:sqlite";

const now = () => Math.floor(Date.now() / 1000);

// node:sqlite отдаёт BLOB как Uint8Array (НЕ Buffer) — на этом первый прогон теста
// молча читал книгу сделок как строку "37,50,..." вместо JSON. Приводим оба вида.
function toBuf(v) {
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === "string") return Buffer.from(v, "utf8");
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  if (ArrayBuffer.isView(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return Buffer.from(String(v), "utf8");
}
const toText = (v) => (typeof v === "string" ? v : toBuf(v).toString("utf8"));

// Cloudflare KV допускает ДВЕ формы второго аргумента get: строку типа
// (kv.get(key, "json")) и объект (kv.get(key, {type: "json"})). Воркер пользуется
// первой — 15 вызовов с "json" и 2 с "arrayBuffer". Пока слой понимал только
// объект, всё возвращалось текстом: книга сделок приходила строкой, и её длина
// в байтах читалась как число сделок (в кабинете владельца — «10490 сделок»,
// а статистика открытий обнулялась). Ошибка тихая, поэтому нормализуем здесь.
const normOpts = (o) => (typeof o === "string" ? { type: o } : (o || {}));

export function openKV(path) {
  const db = new DatabaseSync(path);
  // WAL: сервер читает и пишет одновременно (маячки открытий идут потоком,
  // стол в это же время читает книгу сделок). Без WAL читатели ждали бы писателя.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`CREATE TABLE IF NOT EXISTS kv (
             key      TEXT PRIMARY KEY,
             value    BLOB NOT NULL,
             metadata TEXT,
             expires  INTEGER
           )`);
  db.exec("CREATE INDEX IF NOT EXISTS kv_expires ON kv(expires)");

  const qGet = db.prepare("SELECT value, metadata, expires FROM kv WHERE key = ?");
  const qPut = db.prepare(
    "INSERT INTO kv (key, value, metadata, expires) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, " +
    "metadata = excluded.metadata, expires = excluded.expires");
  const qDel = db.prepare("DELETE FROM kv WHERE key = ?");
  const qPurge = db.prepare("DELETE FROM kv WHERE expires IS NOT NULL AND expires <= ?");

  function alive(row) {
    return row && (row.expires == null || row.expires > now());
  }

  return {
    async get(key, optsRaw) {
      const opts = normOpts(optsRaw);
      const row = qGet.get(String(key));
      if (!alive(row)) {
        if (row) qDel.run(String(key));   // истёкшее убираем лениво, как это делает KV
        return null;
      }
      const wantBytes = opts.type === "arrayBuffer" || opts.type === "bytes";
      if (wantBytes) return toBuf(row.value);
      const text = toText(row.value);
      if (opts.type === "json") { try { return JSON.parse(text); } catch { return null; } }
      return text;
    },

    // Возвращает и значение, и metadata — у KV это getWithMetadata.
    async getWithMetadata(key, optsRaw) {
      const opts = normOpts(optsRaw);
      const row = qGet.get(String(key));
      if (!alive(row)) return { value: null, metadata: null };
      let text = toText(row.value);
      if (opts.type === "json") { try { text = JSON.parse(text); } catch { text = null; } }
      let meta = null;
      if (row.metadata) { try { meta = JSON.parse(row.metadata); } catch { meta = null; } }
      return { value: text, metadata: meta };
    },

    async put(key, value, opts = {}) {
      let stored;
      if (value instanceof ArrayBuffer) stored = Buffer.from(value);
      else if (ArrayBuffer.isView(value)) stored = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      else if (Buffer.isBuffer(value)) stored = value;
      else stored = Buffer.from(String(value), "utf8");
      const meta = opts.metadata == null ? null : JSON.stringify(opts.metadata);
      let expires = null;
      if (opts.expirationTtl != null) expires = now() + Number(opts.expirationTtl);
      else if (opts.expiration != null) expires = Number(opts.expiration);
      qPut.run(String(key), stored, meta, expires);
    },

    async delete(key) { qDel.run(String(key)); },

    async list(opts = {}) {
      const prefix = opts.prefix || "";
      const limit = Math.min(Number(opts.limit) || 1000, 1000);
      // Курсор — последний отданный ключ (base64). Диапазонный поиск по PRIMARY KEY,
      // а не LIKE: на десятках тысяч событий открытий это разница между индексом и сканом.
      let after = "";
      if (opts.cursor) { try { after = Buffer.from(String(opts.cursor), "base64").toString("utf8"); } catch { after = ""; } }
      const hi = prefix + "\uffff";
      const rows = db.prepare(
        "SELECT key, metadata, expires FROM kv WHERE key >= ? AND key < ? AND key > ? " +
        "ORDER BY key LIMIT ?"
      ).all(prefix, hi, after, limit + 1);
      const page = rows.slice(0, limit).filter((r) => r.expires == null || r.expires > now());
      const more = rows.length > limit;
      const keys = page.map((r) => {
        let meta = null;
        if (r.metadata) { try { meta = JSON.parse(r.metadata); } catch { meta = null; } }
        const o = { name: r.key, metadata: meta };
        if (r.expires != null) o.expiration = r.expires;
        return o;
      });
      const out = { keys, list_complete: !more };
      if (more && page.length) out.cursor = Buffer.from(page[page.length - 1].key, "utf8").toString("base64");
      return out;
    },

    // Обслуживание: KV удаляет истёкшее само, SQLite — нет.
    purgeExpired() { const r = qPurge.run(now()); return r.changes; },
    count() { return db.prepare("SELECT COUNT(*) AS n FROM kv").get().n; },
    close() { db.close(); },
  };
}
