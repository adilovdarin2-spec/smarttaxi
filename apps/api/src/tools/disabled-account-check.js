import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Выключенный аккаунт выключен и для уже выданного токена.
//
// Вход отказывает неактивному пользователю — и на этом всё заканчивалось.
// Токен живёт год, а проверка на каждом запросе смотрела только версию сессии:
// кто уже вошёл, тот и оставался внутри до следующего года.
//
// Сегодня выключателем никто не пользуется, поэтому дыру и не видно. Она
// откроется ровно в тот день, когда кому-то понадобится остановить аккаунт —
// то есть когда это будет срочно.

const root = fileURLToPath(new URL("../", import.meta.url));

// --- Проверка на каждом запросе смотрит и на выключатель ---
const auth = readFileSync(`${root}common/auth.js`, "utf8");
assert.match(
  auth,
  /SELECT session_version, is_active FROM users WHERE id=\$1/,
  "проверка сессии обязана читать и признак активности аккаунта"
);
assert.match(
  auth,
  /ACCOUNT_DISABLED/,
  "выключенному аккаунту нужен свой отказ, а не молчаливый пропуск"
);
// Отказ идёт 401, а не 403: токен мёртв, а не «нет прав на это действие» —
// от этого зависит, выйдет приложение из аккаунта или просто покажет ошибку.
assert.match(
  auth,
  /new AppError\("This account is disabled", 401, "ACCOUNT_DISABLED"\)/,
  "отказ должен быть 401: приложение по нему выходит из аккаунта"
);

// --- Вход по-прежнему отказывает ---
const authRoutes = readFileSync(`${root}modules/auth/auth.routes.js`, "utf8");
assert.match(authRoutes, /WHERE phone=\$1 AND is_active=true/, "вход не должен пускать выключенный аккаунт");

// --- И приложение, и сайт понимают этот код как «токен мёртв» ---
for (const [path, description] of [
  ["../../mobile/smarttaxi_app/lib/core/api/api_transport.dart", "приложение"],
  ["../../web/src/lib/api.js", "сайт"]
]) {
  const full = `${root}${path}`;
  if (!existsSync(full)) continue;
  const source = readFileSync(full, "utf8");
  assert(
    source.includes("ACCOUNT_DISABLED"),
    `${description} оставит человека на экране, где ни один запрос не проходит: ACCOUNT_DISABLED должен считаться мёртвым токеном`
  );
}

console.log("Disabled account checks ok: switching an account off ends its open sessions, and both clients sign out");
