import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Приложение не врёт человеку о его собственном телефоне.
//
// Над входом рисовалась полоса состояния с временем «9:41» — временем из
// рекламных макетов Apple — и нарисованными антеннами. На широком экране
// приложение показано внутри рамки телефона, и такая полоса читается как
// часть рамки. Но ниже 900 пикселей рамки нет: страница и есть приложение
// на настоящем телефоне, и фальшивые часы висели прямо под настоящими.
//
// Проверка держит две вещи: времени-литерала в исходниках нет, и на узком
// экране декоративная полоса скрыта.

const src = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|css)$/.test(full)) out.push(full);
  }
  return out;
}

test("часы в приложении не выдуманы", () => {
  // Время вида 9:41 / 09:41 в разметке — всегда макетное: настоящее берут
  // из Date, а не пишут руками.
  const offenders = [];
  for (const file of walk(src)) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      // Ловим только время, нарисованное в разметке как текст на экране:
      // <span>9:41</span>. Значение по умолчанию в поле формы (time: "08:00"
      // у регулярных поездок) — честная величина, её человек сам меняет.
      if (!/>\s*\d{1,2}:\d{2}\s*</.test(line)) return;
      offenders.push(`${file.replace(src, "src")}:${index + 1} ${line.trim().slice(0, 70)}`);
    });
  }
  assert.deepEqual(offenders, [], `выдуманное время в интерфейсе:\n  ${offenders.join("\n  ")}`);
});

test("на настоящем телефоне нет второй полосы состояния", () => {
  const css = readFileSync(join(src, "styles.css"), "utf8");
  // Рамка-макет появляется с 900 пикселей; ниже её нет, значит нет и повода
  // рисовать свою полосу поверх системной.
  const rule = /@media \(max-width: 899px\) \{[^@]*?\.auth-status-bar \{\s*display: none;/s;
  assert.match(css, rule, "декоративная полоса состояния снова показывается на телефоне");
});
