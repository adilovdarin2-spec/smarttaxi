import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NOTIFICATION_KEYS,
  NOTIFICATION_MESSAGES,
  SUPPORTED_LOCALES,
  normalizeLocale,
  notificationMessage
} from "../modules/notifications/notification-messages.js";

// Уведомление приходит на языке человека, а не на русском всем подряд.
//
// Push показывает операционная система, часто когда приложение закрыто, —
// перевести его на клиенте нельзя. Раньше все 36 уведомлений были написаны
// русскими литералами прямо в местах отправки, и человек с казахским
// интерфейсом получал русский текст: «Водитель найден», «Ваша очередь»,
// «Место подтверждено».
//
// Проверка держит три вещи: каждый ключ переведён на все четыре языка,
// подстановки не теряются, и в местах отправки не осталось русских литералов.

const root = fileURLToPath(new URL("../", import.meta.url));

// --- Каждый ключ на всех четырёх языках ---
assert(NOTIFICATION_KEYS.length >= 30, `ключей всего ${NOTIFICATION_KEYS.length}`);
for (const key of NOTIFICATION_KEYS) {
  for (const locale of SUPPORTED_LOCALES) {
    const text = NOTIFICATION_MESSAGES[key][locale];
    assert(text, `${key}: нет перевода на ${locale}`);
    assert(text.title && text.title.trim(), `${key}/${locale}: пустой заголовок`);
    assert(text.body && text.body.trim(), `${key}/${locale}: пустой текст`);
  }
  // Подстановки должны быть одинаковые во всех языках: потерянная {price}
  // означает уведомление о цене без цены.
  const slots = (locale) => [
    ...`${NOTIFICATION_MESSAGES[key][locale].title} ${NOTIFICATION_MESSAGES[key][locale].body}`
      .matchAll(/\{(\w+)\}/g)
  ].map(match => match[1]).sort().join(",");
  const reference = slots("ru");
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(slots(locale), reference, `${key}: подстановки в ${locale} не совпадают с русскими`);
  }
}

// --- Отсутствующий параметр не печатает "undefined" живому человеку ---
{
  const text = notificationMessage("tripCompleted", "kk", {});
  assert(!/undefined|null|\{price\}/.test(`${text.title} ${text.body}`), `пустая подстановка протекла: ${text.body}`);
  const named = notificationMessage("driverFoundNamed", "zh", { name: "Айдос" });
  assert(named.body.includes("Айдос"), "имя не подставилось");
  assert.equal(normalizeLocale("KK-Cyrl-KZ"), "kk", "язык с регионом должен сводиться к коду");
  assert.equal(normalizeLocale("de"), "ru", "незнакомый язык становится русским, а не падает");
}

// --- В местах отправки не осталось русских литералов ---
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".js")) out.push(full);
  }
  return out;
}

// Текст, написанный живым человеком — причина блокировки, ответ поддержки, —
// не переводится и передаётся как body. Заголовок при этом всё равно берётся
// из ключа, поэтому русских `title:` быть не должно нигде, кроме SOS: он
// уходит владельцу и в поддержку, а не пассажиру или водителю.
const SOS_FILE = join(root, "modules", "support", "support.routes.js");
const offenders = [];
for (const file of walk(join(root, "modules"))) {
  if (file.includes("notification-messages.js")) continue;
  const src = readFileSync(file, "utf8");
  // Только файлы, которые действительно шлют уведомления. В остальных
  // `title:` значит совсем другое — например, название места в справочнике
  // адресов, где перевод решается на клиенте через placeKind.
  if (!/\bnotify(User|OrderClient|OrderDriver)\(/.test(src)) continue;
  src.split("\n").forEach((line, index) => {
    if (!/title:\s*[`"][^`"]*[А-Яа-яЁё]/.test(line)) return;
    if (file === SOS_FILE && line.includes("SOS")) return;
    offenders.push(`${file.replace(root, "")}:${index + 1} ${line.trim().slice(0, 70)}`);
  });
}
assert.deepEqual(
  offenders,
  [],
  `уведомление написано по-русски мимо справочника:\n  ${offenders.join("\n  ")}`
);

// --- Русский текст не перекрывает переведённый ---
//
// Слова живого человека передаются как body и не переводятся — на это правило
// выше и рассчитано. Но русский литерал рядом с ключом — другое дело:
// заголовок приходил на языке человека, а текст под ним по-русски. Так было у
// пропуска регулярной поездки: в справочнике четыре языка, а вызов подставлял
// русский поверх них.
const overrides = [];
for (const file of walk(join(root, "modules"))) {
  if (file.includes("notification-messages.js")) continue;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, index) => {
    if (!/^\s*key:\s*"/.test(line)) return;
    // Тело, вписанное литералом в тех же нескольких строках, что и ключ.
    const nearby = lines.slice(index, index + 6).join("\n");
    const literalBody = /body:\s*"[^"]*[А-Яа-яЁё][^"]*"/.exec(nearby);
    if (!literalBody) return;
    overrides.push(`${file.replace(root, "")}:${index + 1} ${literalBody[0].slice(0, 60)}`);
  });
}
assert.deepEqual(
  overrides,
  [],
  `русский текст перекрывает перевод из справочника — заголовок придёт на языке человека, а текст нет:\n  ${overrides.join("\n  ")}`
);

// --- Язык действительно хранится и приходит с клиента ---
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const authRoutes = readFileSync(join(root, "modules", "auth", "auth.routes.js"), "utf8");
const service = readFileSync(join(root, "modules", "notifications", "notification.service.js"), "utf8");

assert.match(schema, /locale TEXT NOT NULL DEFAULT 'ru'/, "в schema.sql нет языка пользователя");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS locale TEXT/, "миграция не добавляет язык существующим базам");
assert.match(authRoutes, /router\.post\("\/me\/locale"/, "приложению некуда сообщить свой язык");
assert.match(service, /SELECT locale FROM users WHERE id=\$1/, "отправка не читает язык получателя");
assert.match(service, /if \(!body\) body = text\.body;/, "слова живого человека должны побеждать текст из справочника");

console.log(
  `Notification language checks ok: ${NOTIFICATION_KEYS.length} keys x ${SUPPORTED_LOCALES.length} languages, no Russian left at the call sites`
);
