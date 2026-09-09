// Импорт выгрузки Cloudflare KV в локальное хранилище на SQLite.
//
// Вход — два файла, снятых wrangler-ом:
//   kvkeys.json   — листинг ВСЕХ ключей: name, expiration, metadata.
//                   У событий открытий (hit:/act:/deskhit:) вся нагрузка лежит
//                   в metadata, поэтому значения им не нужны.
//   kvvalues.json — значения остальных ключей (сделки, реквизиты, ключи входа,
//                   кэш обзоров), объект «ключ → значение».
//
// Запуск: node import_kv.mjs <kvkeys.json> <kvvalues.json> <путь к kv.db>
// Идемпотентен: повторный прогон перезаписывает те же ключи, а не двоит их.
//
// В конце — СВЕРКА: сколько ключей было в выгрузке, сколько легло в базу, совпали
// ли значения, metadata и сроки. Без неё переключение делать нельзя: пропавшая
// книга сделок обнаружилась бы уже на глазах партнёра.

import { readFileSync } from "node:fs";
import { openKV } from "./kv.mjs";

const [keysPath, valsPath, dbPath] = process.argv.slice(2);
if (!keysPath || !valsPath || !dbPath) {
  console.error("нужно: node import_kv.mjs <kvkeys.json> <kvvalues.json> <kv.db>");
  process.exit(2);
}

const keys = JSON.parse(readFileSync(keysPath, "utf8"));
const vals = JSON.parse(readFileSync(valsPath, "utf8"));
const kv = openKV(dbPath);
const now = Math.floor(Date.now() / 1000);

let put = 0, skippedExpired = 0, noValue = 0;
const byGroup = {};
const expected = new Map();

for (const k of keys) {
  const name = k.name;
  const group = name.split(":")[0];
  byGroup[group] = (byGroup[group] || 0) + 1;

  // Истёкшие за время выгрузки не переносим: KV их уже не отдаёт, и в базе
  // они были бы мусором с прошедшим сроком.
  if (k.expiration && k.expiration <= now) { skippedExpired++; continue; }

  let value = Object.prototype.hasOwnProperty.call(vals, name) ? vals[name] : undefined;
  if (value === undefined) {
    // Ожидаемо для событий: значение пустое, всё в metadata.
    value = "";
    noValue++;
  } else if (value === null) {
    // Ключ был в листинге, но к моменту выгрузки значения не стало (TTL).
    skippedExpired++;
    continue;
  }

  const opts = {};
  if (k.metadata != null) opts.metadata = k.metadata;
  if (k.expiration != null) opts.expiration = k.expiration;
  await kv.put(name, value, opts);
  expected.set(name, { value, metadata: k.metadata ?? null, expiration: k.expiration ?? null });
  put++;
}

console.log("=== ИМПОРТ ===");
console.log("ключей в выгрузке:", keys.length);
console.log("записано в базу:  ", put);
console.log("пропущено истёкших:", skippedExpired);
console.log("без значения (нагрузка в metadata):", noValue);
console.log("в базе сейчас всего:", kv.count());

// --- СВЕРКА
let okVal = 0, badVal = 0, okMeta = 0, badMeta = 0, okExp = 0, badExp = 0;
const problems = [];
for (const [name, want] of expected) {
  const got = await kv.getWithMetadata(name);
  if (got.value === want.value) okVal++;
  else { badVal++; problems.push("значение расходится: " + name); }

  const wantMeta = want.metadata == null ? null : JSON.stringify(want.metadata);
  const gotMeta = got.metadata == null ? null : JSON.stringify(got.metadata);
  if (wantMeta === gotMeta) okMeta++;
  else { badMeta++; problems.push("metadata расходится: " + name); }
}
// Сроки проверяем через list: он отдаёт expiration.
for (const group of Object.keys(byGroup)) {
  const page = await kv.list({ prefix: group + ":", limit: 1000 });
  for (const row of page.keys) {
    const want = expected.get(row.name);
    if (!want) continue;
    const same = (want.expiration ?? null) === (row.expiration ?? null);
    if (same) okExp++; else { badExp++; problems.push("срок расходится: " + row.name); }
  }
}

console.log("\n=== СВЕРКА ===");
console.log("значения совпали: %d, расходятся: %d", okVal, badVal);
console.log("metadata совпала: %d, расходится: %d", okMeta, badMeta);
console.log("сроки совпали:    %d, расходятся: %d", okExp, badExp);
console.log("\nпо группам в базе:");
for (const g of Object.keys(byGroup).sort()) {
  // Префикс с двоеточием не находит ключ без него (дедуп канала лежит как "history"),
  // поэтому считаем и точное совпадение имени группы.
  const page = await kv.list({ prefix: g + ":", limit: 1000 });
  const bare = (await kv.get(g)) === null ? 0 : 1;
  const inDb = page.keys.length + bare;
  console.log("  " + g.padEnd(9) + " выгрузка " + String(byGroup[g]).padStart(3) + " -> база " + String(inDb).padStart(3));
}
if (problems.length) {
  console.log("\nПРОБЛЕМЫ (%d):", problems.length);
  for (const p of problems.slice(0, 10)) console.log("  ", p);
}
kv.close();
process.exit(badVal || badMeta || badExp ? 1 : 0);
