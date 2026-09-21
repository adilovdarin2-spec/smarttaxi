import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { commissionPercentForOrder } from "../modules/orders/order-pricing.service.js";

// Списывается ровно то, что подписано.
//
// Оферта разделяет две роли. Водителю такси — одна ставка при любой оплате.
// Курьеру — ноль при наличной оплате и та же ставка при безналичной: наличные
// он получает в руки, платформа денег в этой сделке не держит.
//
// Код же брал процент прямо из тарифа и списывал полную ставку с любой
// доставки. Курьер подписывал ноль, а в долг ему падала семёрка — и узнавал
// он об этом уже после рейса.
//
// Проверка читает ставки из самой оферты, а не из чисел, вписанных сюда:
// если однажды поменяют документ, разойтись молча не получится.

const root = fileURLToPath(new URL("../", import.meta.url));
const legalPath = join(root, "..", "..", "web", "src", "legal", "legal-content.json");

if (!existsSync(legalPath)) {
  console.warn("Courier commission checks skipped: apps/web is not present in this runtime image");
} else {
  const legal = readFileSync(legalPath, "utf8");

  // «Для курьера при наличной оплате комиссия Платформы составляет 0
  // процентов, а при безналичной оплате — 7 процентов»
  const clauses = [...legal.matchAll(
    /Для курьера при наличной оплате комиссия Платформы составляет (\d+) процентов, а при безналичной оплате — (\d+) процент/g
  )];
  assert(clauses.length > 0, "в оферте не найдено правило о комиссии курьера");
  const cashPercent = Number(clauses[0][1]);
  const cashlessPercent = Number(clauses[0][2]);
  assert(
    clauses.every(([, cash, cashless]) => Number(cash) === cashPercent && Number(cashless) === cashlessPercent),
    "оферта называет курьеру разные ставки в разных местах"
  );

  const taxiClauses = [...legal.matchAll(/комиссия Платформы составляет (\d+) процент/g)].map(m => Number(m[1]));
  const taxiPercent = taxiClauses.find(percent => percent > 0);
  assert(taxiPercent, "в оферте не найдена ставка водителя такси");

  const delivery = { name: "Delivery", service_commission_percent: taxiPercent };
  const taxi = { name: "Economy", service_commission_percent: taxiPercent };

  // --- Курьер ---
  assert.equal(
    commissionPercentForOrder(delivery, "CASH"),
    cashPercent,
    `оферта обещает курьеру ${cashPercent}% за наличную доставку`
  );
  for (const method of ["KASPI", "CARD"]) {
    assert.equal(
      commissionPercentForOrder(delivery, method),
      cashlessPercent,
      `оферта обещает курьеру ${cashlessPercent}% за безналичную доставку (${method})`
    );
  }

  // --- Водитель такси: способ оплаты ничего не меняет ---
  for (const method of ["CASH", "KASPI", "CARD", "CASHBACK", null, undefined]) {
    assert.equal(
      commissionPercentForOrder(taxi, method),
      taxiPercent,
      `у такси ставка не зависит от оплаты, а при ${method} получилось иначе`
    );
  }

  // --- Ни одно место в коде не считает комиссию мимо общего правила ---
  const modules = join(root, "modules");
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".js")) out.push(full);
    }
    return out;
  };
  const offenders = [];
  for (const file of walk(modules)) {
    if (file.endsWith("order-pricing.service.js")) continue;
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, index) => {
      // Умножение на процент из тарифа в обход общего правила.
      if (!/service_commission_percent/.test(line)) return;
      if (!/[*/]\s*100|\*\s*Number|Number\([^)]*service_commission_percent[^)]*\)\s*\//.test(line)) return;
      offenders.push(`${file.replace(root, "")}:${index + 1} ${line.trim().slice(0, 78)}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `комиссия считается мимо общего правила — курьерская ставка сюда не дойдёт:\n  ${offenders.join("\n  ")}`
  );

  console.log(
    `Courier commission checks ok: delivery ${cashPercent}% cash / ${cashlessPercent}% cashless, taxi ${taxiPercent}% either way, one rule everywhere`
  );
}
