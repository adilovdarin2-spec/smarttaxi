import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Один ответ на всех, а не один запрос наружу на каждого спрашивающего.
//
// Расчёт цены и времени подачи идёт через внешний маршрутизатор. На проде
// это общий демо-сервер OSRM с пределом вежливости: если по нашему адресу
// прилетит блокировка, пассажиры перестанут видеть цену — все сразу.
//
// Диагностика карт открыта без входа, а health опрашивает платформа. Раньше
// каждый такой вызов уходил во внешний мир. Проверка держит три вещи: проба
// кешируется, одновременные вызовы делят один запрос, и у открытого
// маршрута есть ограничитель.

const root = fileURLToPath(new URL("../", import.meta.url));

// --- Открытый маршрут ограничен ---
const routes = readFileSync(`${root}modules/maps/maps.routes.js`, "utf8");
assert.match(
  routes,
  /router\.get\("\/diagnostics",\s*\w*[Ll]imiter/,
  "диагностика карт открыта без входа — у неё обязан быть ограничитель"
);

// --- Проба действительно одна на всех ---
let outbound = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("/route/v1/")) {
    outbound += 1;
    return new Response(JSON.stringify({ code: "Ok", routes: [{}] }), { status: 200 });
  }
  return realFetch(url, init);
};

process.env.ROUTING_BASE_URL = process.env.ROUTING_BASE_URL || "https://router.project-osrm.org";
const { checkOsrm, resetOsrmProbeCache } = await import("../modules/maps/maps.diagnostics.js");

resetOsrmProbeCache();
const crowd = await Promise.all(Array.from({ length: 100 }, () => checkOsrm()));
assert.equal(outbound, 1, `сто одновременных проверок ушли наружу ${outbound} раз, а должны один`);
assert.ok(crowd.every(one => one && one.status), "не все получили ответ");

await checkOsrm();
assert.equal(outbound, 1, "повторная проверка внутри окна снова пошла наружу");

resetOsrmProbeCache();
await checkOsrm();
assert.equal(outbound, 2, "после окна проверка обязана сходить наружу заново, иначе поломку не заметить");

globalThis.fetch = realFetch;

// --- Окно не бесконечное: устаревший ответ хуже отсутствующего ---
const diagnostics = readFileSync(`${root}modules/maps/maps.diagnostics.js`, "utf8");
const ttl = /PROBE_TTL_MS\s*=\s*([\d_]+)/.exec(diagnostics);
assert(ttl, "окно кеша пробы исчезло");
const ms = Number(ttl[1].replace(/_/g, ""));
assert(ms >= 5_000 && ms <= 120_000, `окно ${ms} мс: слишком коротко или слишком долго, чтобы заметить поломку маршрутизатора`);

console.log(`Outbound probe checks ok: 100 callers share 1 request, window ${ms / 1000}s, open route rate-limited`);
