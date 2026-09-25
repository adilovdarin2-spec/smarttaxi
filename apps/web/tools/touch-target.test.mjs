import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Палец на сенсорном экране накрывает около девяти миллиметров — это
// примерно 44 пикселя. Кнопка ниже этого промахивается, и на экране
// межгорода, где 156 кнопок «Сохранить» идут подряд и каждая меняет цену
// направления, промах по соседней стоит денег.
//
// Панель открывают с телефона и с планшета на стойке, а не только с ПК.
// Проверка следит за одним: если в панели появился управляющий элемент
// ниже 44 пикселей, для сенсорных экранов его обязаны поднять.

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

const MINIMUM = 44;

function rules(source) {
  const found = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(source))) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    found.push({ selector, declarations: match[2], at: match.index });
  }
  return found;
}

function declaredHeight(declarations) {
  const match = /(?:^|;|\s)(min-height|height)\s*:\s*(\d+(?:\.\d+)?)px/.exec(declarations);
  return match ? { property: match[1], value: Number(match[2]) } : null;
}

// Управляющий элемент — тот, по которому человек целится пальцем. Полоски
// внутри бургера (`span`) и прочие декорации сюда не попадают.
function isAdminControl(selector) {
  if (!selector.includes(".admin-")) return false;
  if (/\bspan\b|::?(before|after)/.test(selector)) return false;
  return /(button|select|\binput\b|chip)\s*$/.test(selector.split(",")[0].trim());
}

// Блок для сенсорных экранов — единственное место, где разрешено чинить
// такие высоты.
const coarseStart = css.indexOf("@media (pointer: coarse)");
assert.notEqual(coarseStart, -1, "правила для сенсорных экранов исчезли из styles.css");
const coarse = css.slice(coarseStart);

const covered = new Map();
for (const rule of rules(coarse)) {
  const height = declaredHeight(rule.declarations);
  if (!height || height.value < MINIMUM) continue;
  for (const part of rule.selector.split(",")) covered.set(part.trim(), height.value);
}

test("каждая управляющая деталь панели дорастает до пальца на сенсорном экране", () => {
  const small = [];
  for (const rule of rules(css.slice(0, coarseStart))) {
    if (!isAdminControl(rule.selector)) continue;
    const height = declaredHeight(rule.declarations);
    if (!height || height.value >= MINIMUM) continue;
    for (const part of rule.selector.split(",")) {
      const one = part.trim();
      if (!covered.has(one)) small.push(`${one} — ${height.property}: ${height.value}px`);
    }
  }
  assert.deepEqual(
    small,
    [],
    `по этим элементам не попасть пальцем, а в блок (pointer: coarse) их не внесли:\n  ${small.join("\n  ")}`
  );
});

test("правило не трогает мышь", () => {
  // Поднимать высоту на ПК незачем: там курсор попадает и в 38 пикселей,
  // а плотные таблицы панели рассчитаны на компактные кнопки.
  const compact = /\.admin-primary-button\.compact[\s\S]{0,200}?min-height:\s*38px/.test(css.slice(0, coarseStart));
  assert.ok(compact, "компактная кнопка для мыши должна остаться прежней");
});
