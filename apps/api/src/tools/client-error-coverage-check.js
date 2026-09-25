import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Каждый отказ сервера должен быть объяснён словами.
//
// У API 95 кодов ошибок, до которых дотягивается мобильное приложение. Знало
// оно 36 — остальные превращались в "что-то пошло не так", и человек упирался
// в стену, не понимая, что сделать: место в очереди закрылось, бронь
// просрочена, цена вне границ, код из SMS устарел. Хуже всего это выглядело на
// регистрации, где отказ "SMS не подключены" показывался как "проверьте
// интернет".
//
// Проверка считает достижимые коды сама, по исходникам: идёт от путей, которые
// зовёт api_client.dart, находит обработчик каждого пути и собирает коды
// AppError из него и из сервисов, которые он вызывает. Поэтому новый маршрут
// или новый код в существующем обработчике роняют её сразу, а не через месяц
// на живом человеке.

const root = fileURLToPath(new URL("../", import.meta.url));
const serverSrc = readFileSync(join(root, "server.js"), "utf8");
const mobileRoot = join(root, "..", "..", "mobile", "smarttaxi_app");
const clientPath = join(mobileRoot, "lib", "core", "api", "api_client.dart");

if (!existsSync(clientPath)) {
  console.warn("Client error coverage check skipped: apps/mobile is not present in this runtime image");
  process.exit(0);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".js") || full.endsWith(".dart")) out.push(full);
  }
  return out;
}

const moduleFiles = walk(join(root, "modules"));
const moduleSrc = new Map(moduleFiles.map(file => [file, readFileSync(file, "utf8")]));

const APP_ERROR = /new AppError\((?:[^,]|\([^)]*\))*,\s*\d{3},\s*"([A-Z_]+)"/g;
const codesIn = (text) => new Set([...text.matchAll(APP_ERROR)].map(match => match[1]));

// Какой файл стоит за каждой смонтированной переменной роутера.
const importedFrom = new Map();
for (const match of serverSrc.matchAll(/import\s+([^;]+?)\s+from\s+"(\.\/modules\/[^"]+)"/g)) {
  for (const name of match[1].match(/\w+/g) || []) {
    if (!importedFrom.has(name)) importedFrom.set(name, match[2]);
  }
}
const mounts = new Map();
for (const match of serverSrc.matchAll(/app\.use\("(\/api\/[^"]*)",\s*(\w+)\)/g)) {
  if (!mounts.has(match[2])) mounts.set(match[2], []);
  mounts.get(match[2]).push(match[1]);
}

// Где объявлена каждая экспортируемая функция — чтобы заглянуть в сервис,
// который обработчик вызывает: половина кодов живёт именно там.
const exportedIn = new Map();
for (const [file, src] of moduleSrc) {
  for (const match of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    if (!exportedIn.has(match[1])) exportedIn.set(match[1], []);
    exportedIn.get(match[1]).push(file);
  }
}
function exportedBody(file, name) {
  const src = moduleSrc.get(file);
  const start = src.search(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`));
  if (start < 0) return "";
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport\s/);
  return src.slice(start, start + 1 + (next < 0 ? 2000 : next));
}

const normalize = (path) => path.replace(/\$\{?[\w.]+\}?/g, ":x").replace(/:\w+/g, ":x").replace(/\/+$/, "");
const clientSrc = readFileSync(clientPath, "utf8");
const clientPaths = new Set(
  [...clientSrc.matchAll(/['"](\/api\/[^'"]*)['"]/g)].map(match => normalize(match[1]))
);
assert(clientPaths.size > 50, `api_client.dart: нашлось всего ${clientPaths.size} путей — разбор сломался`);

const reachable = new Set();
let matchedRoutes = 0;
for (const [variable, prefixes] of mounts) {
  const relative = importedFrom.get(variable);
  if (!relative) continue;
  const file = join(root, relative.replace("./", ""));
  if (!moduleSrc.has(file)) continue;
  const src = moduleSrc.get(file);
  const handlers = [...src.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]*)"/g)];
  handlers.forEach((handler, index) => {
    const start = handler.index;
    const end = index + 1 < handlers.length ? handlers[index + 1].index : src.length;
    const body = src.slice(start, end);
    const head = src.slice(start, start + 400);
    // Владельческие и финансовые экраны живут в вебе, не в приложении.
    if (head.includes('requireRole("OWNER"')) return;
    for (const prefix of prefixes) {
      const full = normalize(`${prefix}${handler[2]}`.replace(/\/{2,}/g, "/"));
      if (!clientPaths.has(full)) continue;
      matchedRoutes += 1;
      for (const code of codesIn(body)) reachable.add(code);
      for (const call of new Set([...body.matchAll(/\b(\w+)\(/g)].map(m => m[1]))) {
        for (const serviceFile of exportedIn.get(call) || []) {
          for (const code of codesIn(exportedBody(serviceFile, call))) reachable.add(code);
        }
      }
      break;
    }
  });
}

assert(matchedRoutes > 80, `сопоставилось всего ${matchedRoutes} маршрутов — разбор сломался`);
assert(reachable.size > 80, `нашлось всего ${reachable.size} кодов — разбор сломался`);

// Вебхук Kaspi приложение не зовёт: путь совпадает, но ходит туда банк.
const SERVER_TO_SERVER = new Set(["INVALID_WEBHOOK_SIGNATURE", "WEBHOOK_PAYLOAD_INVALID"]);

const dartSrc = walk(join(mobileRoot, "lib"))
  .filter(file => file.endsWith(".dart") && !file.includes("app_localizations"))
  .map(file => readFileSync(file, "utf8"))
  .join("\n");

const unexplained = [...reachable]
  .filter(code => !SERVER_TO_SERVER.has(code))
  .filter(code => !dartSrc.includes(`'${code}'`))
  .sort();

assert.deepEqual(
  unexplained,
  [],
  `приложение покажет "что-то пошло не так" вместо причины для: ${unexplained.join(", ")}`
);

// --- То же самое для сайта ---
//
// Сайт — не черновик приложения: с него заказывают с компьютера, с него же
// работает водитель, если телефон не тянет. Отказы там объяснялись 24 из 99, а
// остальное превращалось в «Не удалось выполнить запрос. Проверьте соединение»
// — человеку говорили, что у него плохой интернет, когда сервер назвал
// причину.
const webSrc = walk(join(mobileRoot, "..", "..", "web", "src"))
  .filter(file => /\.(js|jsx)$/.test(file))
  .map(file => readFileSync(file, "utf8"))
  .join("\n");

const unexplainedOnWeb = [...reachable]
  .filter(code => !SERVER_TO_SERVER.has(code))
  .filter(code => !webSrc.includes(code))
  .sort();

assert.deepEqual(
  unexplainedOnWeb,
  [],
  `сайт покажет "проверьте соединение" вместо причины для: ${unexplainedOnWeb.join(", ")}`
);

console.log(
  `Client error coverage checks ok: ${matchedRoutes} routes, ${reachable.size} reachable codes, all explained`
);
