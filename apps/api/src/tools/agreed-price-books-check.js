import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { repricedOrderFields } from "../modules/orders/order-pricing.service.js";

// Цена, о которой договорились, должна дойти до книг.
//
// Торг меняет цену уже после создания заказа: водитель просит своё, пассажир
// отвечает своим, кто-то соглашается. В заказе обновлялась только price.
// service_commission и pricing_snapshot оставались от первоначальной оценки —
// а проводка ORDER_COMPLETED читает именно снимок (orderAmounts в
// finance.service.js).
//
// Поездка, за которую человек заплатил 800, попадала в книги как 700, и
// комиссия бралась с 700. В обратную сторону хуже: сторговались с 700 до 500,
// а с водителя всё равно удерживали 49 вместо 35. Торг здесь не редкость, а
// сам замысел сервиса.

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8").replace(/\r\n/g, "\n");

// --- Пересчёт ---------------------------------------------------------------
const order = {
  price: 700,
  service_commission: 49,
  pricing_snapshot: {
    serviceCommissionPercent: 7,
    finalPrice: 700,
    estimatedPrice: 700,
    serviceCommission: 49,
    driverEarning: 651
  }
};

const up = repricedOrderFields(order, 800);
assert.equal(up.price, 800);
assert.equal(up.serviceCommission, 56, "комиссия должна считаться с согласованной цены");
assert.equal(up.pricingSnapshot.finalPrice, 800, "снимок читает проводка — в нём должна быть та же сумма");
assert.equal(up.pricingSnapshot.serviceCommission, 56);
assert.equal(up.pricingSnapshot.driverEarning, 744);

const down = repricedOrderFields(order, 500);
assert.equal(down.serviceCommission, 35, "подешевевшая поездка не должна стоить водителю прежней комиссии");
assert.equal(down.pricingSnapshot.driverEarning, 465);

// Курьерский ноль наличными сохраняется: ставка берётся из снимка, а не
// подставляется заново.
const courier = repricedOrderFields({
  price: 800,
  service_commission: 0,
  pricing_snapshot: { serviceCommissionPercent: 0, finalPrice: 800, serviceCommission: 0, driverEarning: 800 }
}, 1000);
assert.equal(courier.serviceCommission, 0, "нулевая ставка курьера не должна превращаться в семь процентов");
assert.equal(courier.pricingSnapshot.driverEarning, 1000);

// Заказ старше самого снимка процент не хранит — восстанавливаем его из того,
// что уже записано, а не подставляем сегодняшнюю ставку.
const legacy = repricedOrderFields({ price: 1000, service_commission: 150, pricing_snapshot: null }, 2000);
assert.equal(legacy.serviceCommission, 300, "старую ставку надо восстановить из записанных чисел");

await assert.rejects(
  async () => repricedOrderFields(order, 0),
  error => error?.code === "INVALID_AGREED_PRICE"
);

// --- Оба согласия торга этим пользуются -------------------------------------
const dispatch = read("modules", "orders", "order-dispatch.service.js");
const accepts = dispatch.split("driver_offer_status='ACCEPTED'").length - 1;
assert.equal(accepts, 2, `ожидалось два места, где торг закрывается согласием, нашлось ${accepts}`);
assert.equal(
  dispatch.split("repricedOrderFields(existing").length - 1,
  2,
  "оба согласия — и пассажира на цену водителя, и водителя на встречную — должны пересчитывать комиссию и снимок"
);
for (const column of ["service_commission=$4", "pricing_snapshot=$5::jsonb"]) {
  assert.equal(
    dispatch.split(column).length - 1,
    2,
    `${column} должен обновляться в обоих местах: проводку считает снимок, а не price`
  );
}

// --- Проводка по-прежнему читает снимок -------------------------------------
const finance = read("modules", "finance", "finance.service.js");
assert(
  finance.includes('snapshotNumber(data, "serviceCommission"'),
  "если проводка перестанет читать снимок, этот пересчёт надо будет переносить"
);

console.log("Agreed price checks ok: the price two people settled on is the price the books record");
