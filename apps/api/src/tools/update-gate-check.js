import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isOlderVersion } from "../modules/app-version/app-version.routes.js";

// Запрет без выхода — это не запрет, это стена.
//
// updateRequired закрывает приложение целиком: экран во весь экран, назад не
// уйти, одна кнопка «Обновить». Кнопка ведёт по APP_UPDATE_URL, и если этой
// переменной нет, она молча не делает ничего. Человек остаётся в приложении,
// из которого нельзя выйти и в которое нельзя войти.
//
// Поднять APP_MIN_SUPPORTED_VERSION владелец рано или поздно поднимет: это
// ровно то, что делают при первом настоящем релизе, чтобы увести всех с
// пилотной сборки. На проде APP_UPDATE_URL сейчас пуст, так что до стены
// оставалась одна переменная окружения.

const root = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (...parts) => readFileSync(join(...parts), "utf8").replace(/\r\n/g, "\n");
const routes = read(root, "modules", "app-version", "app-version.routes.js");

// --- Сравнение версий: не строковое ----------------------------------------
assert.equal(isOlderVersion("1.2.9", "1.2.10"), true, "1.2.9 старше 1.2.10");
assert.equal(isOlderVersion("1.2.10", "1.2.9"), false);
assert.equal(isOlderVersion("1.0.0", "1.0.0"), false, "равные версии не старше друг друга");
assert.equal(isOlderVersion("", "1.0.0"), true, "пустая версия считается самой старой");

// --- Ворота не закрываются, когда некуда идти -------------------------------
assert(
  /updateRequired: belowMinimum && Boolean\(updateUrl\)/.test(routes),
  "принудительное обновление нельзя включать без ссылки, по которой можно обновиться"
);
assert(
  routes.includes("console.warn"),
  "если ворота не включились из-за пустого APP_UPDATE_URL, это должно быть видно в логе, а не молча"
);
// Мягкая подсказка «есть новая версия» ссылки не требует: её можно закрыть.
assert(
  /updateAvailable: clientVersion \? isOlderVersion\(clientVersion, latest\) : false/.test(routes),
  "мягкая подсказка об обновлении не должна зависеть от ссылки — её можно закрыть"
);

// --- И само приложение не рисует кнопку, которая ничего не делает -----------
const main = join(repoRoot, "apps", "mobile", "smarttaxi_app", "lib", "main.dart");
if (existsSync(main)) {
  const source = read(main);
  const at = source.indexOf("class _UpdateRequiredScreen");
  assert(at > 0, "пропал экран принудительного обновления");
  const screen = source.slice(at, at + 3200);
  assert(
    screen.includes("info.updateUrl != null && info.updateUrl!.trim().isNotEmpty"),
    "кнопку «Обновить» нельзя показывать, когда вести по ней некуда"
  );
  assert(
    screen.includes("l10n.updateNoLinkText"),
    "без ссылки человеку надо сказать словами, что делать — уйти с этого экрана он не может"
  );
  assert(
    screen.includes("canPop: false"),
    "экран по-прежнему должен быть непроходимым: смысл ворот в этом"
  );
} else {
  console.warn("Update gate app check skipped: apps/mobile is not present in this runtime image");
}

console.log("Update gate checks ok: the app is never locked behind a button that goes nowhere");
