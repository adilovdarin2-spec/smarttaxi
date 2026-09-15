import test from "node:test";
import assert from "node:assert/strict";
import { driverErrorMessage } from "../src/features/driver/driverErrorPresentation.js";

test("driver errors retain known product actions", () => {
  assert.equal(
    driverErrorMessage({ code: "DRIVER_REGION_NOT_SELECTED" }),
    "Выберите рабочий регион",
  );
  assert.equal(
    driverErrorMessage({ code: "ORDER_ALREADY_ACCEPTED" }),
    "Заказ уже принят другим водителем",
  );
});

test("driver network failures never expose browser diagnostics", () => {
  const visible = driverErrorMessage(new TypeError("Failed to fetch"));
  assert.equal(
    visible,
    "Не удалось подключиться. Проверьте интернет и попробуйте ещё раз.",
  );
  assert.doesNotMatch(visible, /failed|fetch|network/i);
});

test("unknown implementation errors use safe product copy", () => {
  const visible = driverErrorMessage(
    new Error("ECONNRESET at internal-host:4000"),
  );
  assert.equal(visible, "Не удалось выполнить действие. Попробуйте ещё раз.");
  assert.doesNotMatch(visible, /ECONNRESET|internal-host/);
});
