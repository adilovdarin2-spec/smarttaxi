import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_ROUTE_FIX_AGE_MS, isDriverFixFreshEnoughForRoute } from "../modules/routing/routing.service.js";

// Старая точка — это не точка.
//
// Приложение водителя шлёт координаты раз в четыре секунды, пока он работает.
// Но если геолокацию не дали или связь пропала, в driver_locations остаётся
// последняя известная — хоть пятидневной давности, — и маршрут по ней
// строится совершенно настоящий. Проверки на fallback её не ловят: провайдер
// отвечает нормально, просто не про то место.
//
// Так и нашлось: у водителя в базе лежала точка от 20 сентября, и обе стороны
// видели «до точки подачи 24 км, 29 минут» за клиентом в шестистах метрах.
// Водитель от такого заказа откажется, а пассажир будет ждать полчаса машину,
// которая стоит рядом.

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8").replace(/\r\n/g, "\n");

// --- Само правило -----------------------------------------------------------
const now = Date.UTC(2026, 8, 25, 12, 0, 0);
assert.equal(isDriverFixFreshEnoughForRoute(new Date(now - 1000), now), true, "секундная точка свежая");
assert.equal(isDriverFixFreshEnoughForRoute(new Date(now - MAX_ROUTE_FIX_AGE_MS + 1000), now), true, "минутная точка ещё годится");
assert.equal(isDriverFixFreshEnoughForRoute(new Date(now - MAX_ROUTE_FIX_AGE_MS - 1000), now), false, "старше окна — уже не точка");
assert.equal(isDriverFixFreshEnoughForRoute(new Date(now - 5 * 24 * 3600 * 1000), now), false, "пятидневная точка не годится");
assert.equal(isDriverFixFreshEnoughForRoute(null, now), false, "без времени точка не годится");
assert.equal(isDriverFixFreshEnoughForRoute("не дата", now), false, "мусор вместо времени — не точка");
assert(
  MAX_ROUTE_FIX_AGE_MS <= 5 * 60 * 1000,
  "окно свежести не должно растягиваться: за пять минут машина уезжает так, что расчёт становится неправдой"
);

// --- Маршрут отказывается, а не врёт ----------------------------------------
const routing = read("modules", "routing", "routing.service.js");
{
  const at = routing.indexOf("export async function buildDriverToPickupRoute");
  assert(at > 0, "пропал расчёт дороги водителя к пассажиру");
  const body = routing.slice(at, at + 2600);
  assert(
    body.includes("isDriverFixFreshEnoughForRoute(location.updated_at)"),
    "перед построением маршрута надо смотреть на возраст точки"
  );
  assert(
    body.indexOf("isDriverFixFreshEnoughForRoute") < body.indexOf("buildActiveLegRoute"),
    "проверять возраст надо до того, как считать дорогу"
  );
  assert(
    body.includes('"DRIVER_LOCATION_UNAVAILABLE"'),
    "отказ должен быть тем же, что и при полном отсутствии точки: оба приложения его уже объясняют словами"
  );
}

// --- Разбор отмены не судит по старой точке ---------------------------------
const review = read("modules", "orders", "cancellation-review.service.js");
assert(
  review.includes("isDriverFixFreshEnoughForRoute(location.updated_at)"),
  "расстояние до подачи нельзя считать от точки, которой пять дней: по нему решают, был ли водитель на месте"
);
{
  const at = review.indexOf("const fixIsUsable");
  const distanceAt = review.indexOf("fromPickupM = Math.round");
  assert(at > 0 && at < distanceAt, "возраст точки надо проверить до подсчёта расстояния");
}

console.log("Stale fix checks ok: a five-day-old position is treated as no position, not as a place");
