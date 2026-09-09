// Тест слоя хранилища: проверяем совместимость с тем, как воркер пользуется KV.
import { openKV } from "./kv.mjs";
import { unlinkSync, existsSync } from "node:fs";

const DB = "./_kvtest.db";
for (const f of [DB, DB + "-wal", DB + "-shm"]) if (existsSync(f)) unlinkSync(f);
const kv = openKV(DB);
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) { ok++; } else { bad++; console.log("  ПРОВАЛ:", name); } };

// --- базовое
await kv.put("a:1", "значение");
t("get отдаёт положенное", (await kv.get("a:1")) === "значение");
t("get неизвестного = null", (await kv.get("нет")) === null);
await kv.put("a:1", "новое");
t("put перезаписывает", (await kv.get("a:1")) === "новое");
await kv.delete("a:1");
t("delete удаляет", (await kv.get("a:1")) === null);

// --- metadata (на ней держится статистика открытий: нагрузка в metadata, не в value)
await kv.put("hit:andrey:100-x", "", { metadata: { p: "W-SBER", t: "open" } });
const l1 = await kv.list({ prefix: "hit:" });
t("list видит ключ", l1.keys.length === 1 && l1.keys[0].name === "hit:andrey:100-x");
t("list отдаёт metadata", l1.keys[0].metadata && l1.keys[0].metadata.p === "W-SBER");
const wm = await kv.getWithMetadata("hit:andrey:100-x");
t("getWithMetadata отдаёт metadata", wm.metadata.t === "open");

// --- TTL
await kv.put("ttl:живой", "x", { expirationTtl: 60 });
await kv.put("ttl:мёртвый", "x", { expirationTtl: -1 });
t("живой по TTL читается", (await kv.get("ttl:живой")) === "x");
t("истёкший не читается", (await kv.get("ttl:мёртвый")) === null);
const lt = await kv.list({ prefix: "ttl:" });
t("истёкший не попадает в list", lt.keys.length === 1 && lt.keys[0].name === "ttl:живой");
t("list отдаёт expiration", typeof lt.keys[0].expiration === "number");

// --- префиксы не протекают друг в друга
await kv.put("deals:andrey", JSON.stringify([{ v: 1 }]));
await kv.put("deals:polina", JSON.stringify([{ v: 2 }]));
await kv.put("pinfo:andrey", "реквизиты");
const ld = await kv.list({ prefix: "deals:" });
t("префикс отбирает только своё", ld.keys.length === 2);
t("чужой префикс не попал", !ld.keys.some((k) => k.name.startsWith("pinfo")));
t("list_complete на полной выборке", ld.list_complete === true);

// --- пагинация курсором (весь период статистики читается постранично)
for (let i = 0; i < 25; i++) await kv.put("ev:" + String(i).padStart(3, "0"), "e", { metadata: { i } });
const p1 = await kv.list({ prefix: "ev:", limit: 10 });
t("страница ограничена limit", p1.keys.length === 10);
t("есть курсор при остатке", !!p1.cursor && p1.list_complete === false);
const p2 = await kv.list({ prefix: "ev:", limit: 10, cursor: p1.cursor });
t("вторая страница другая", p2.keys[0].name !== p1.keys[0].name);
const p3 = await kv.list({ prefix: "ev:", limit: 10, cursor: p2.cursor });
const all = [...p1.keys, ...p2.keys, ...p3.keys].map((k) => k.name);
t("три страницы дают все 25", new Set(all).size === 25);
t("последняя страница закрывает список", p3.list_complete === true);

// --- бинарное значение (PDF на модерации до 15 МБ)
const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
await kv.put("pdoc:uuid", pdf, { expirationTtl: 604800 });
const back = await kv.get("pdoc:uuid", { type: "arrayBuffer" });
t("байты возвращаются как есть", Buffer.from(back).equals(pdf));
const big = Buffer.alloc(2 * 1024 * 1024, 7);
await kv.put("pdoc:big", big);
t("2 МБ туда-обратно целы", Buffer.from(await kv.get("pdoc:big", { type: "arrayBuffer" })).equals(big));

// --- json-тип и чистка
await kv.put("j:1", JSON.stringify({ a: 5 }));
t("type json парсит", (await kv.get("j:1", { type: "json" })).a === 5);
await kv.put("j:битый", "{не json");
t("битый json даёт null, а не бросает", (await kv.get("j:битый", { type: "json" })) === null);
// Кладём заведомо истёкший ключ и НЕ читаем его: при чтении он удалился бы лениво,
// и purge оказалось бы нечего делать (на этом ошибся первый вариант теста).
await kv.put("purge:1", "x", { expirationTtl: -5 });
await kv.put("purge:2", "x", { expirationTtl: -5 });
const purged = kv.purgeExpired();
t("purge убирает истёкшее пачкой", purged >= 2);
t("после purge их нет в list", (await kv.list({ prefix: "purge:" })).keys.length === 0);
t("живые ключи purge не тронул", (await kv.get("ttl:живой")) === "x");

// --- ФОРМА ВТОРОГО АРГУМЕНТА (регрессия: воркер зовёт get(key, "json") строкой)
await kv.put("f:obj", JSON.stringify({ n: 7 }));
t("строковая форма \"json\" парсит", (await kv.get("f:obj", "json")).n === 7);
t("объектная форма тоже парсит", (await kv.get("f:obj", { type: "json" })).n === 7);
t("без опций отдаёт текст", typeof (await kv.get("f:obj")) === "string");
await kv.put("f:bin", Buffer.from([1, 2, 3]));
t("строковая форма arrayBuffer", Buffer.from(await kv.get("f:bin", "arrayBuffer")).length === 3);
await kv.put("f:list", JSON.stringify([{ a: 1 }, { a: 2 }]));
const lst = await kv.get("f:list", "json");
t("список приходит массивом, а не строкой", Array.isArray(lst) && lst.length === 2);
t("getWithMetadata умеет json", (await kv.getWithMetadata("f:obj", "json")).value.n === 7);

kv.close();
for (const f of [DB, DB + "-wal", DB + "-shm"]) if (existsSync(f)) unlinkSync(f);
console.log(`\nkv.mjs: пройдено ${ok}, провалено ${bad}`);
process.exit(bad ? 1 : 0);
