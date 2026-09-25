// Живой прогон денежных путей против поднятого стека.
//
// Зачем отдельно от src/tools/*-check.js: те читают исходники и ловят, когда
// правило убрали из кода. Они не ловят, когда код на вид правильный, а база
// его не принимает. Ровно так пряталась поломка регулярных рейсов: в
// orders.duration_min клали результат деления, целочисленная колонка его
// отвергала, ошибка уходила в лог — и «школьный маршрут» не создавался
// никогда, месяцами. Ни одна проверка по исходникам этого не видела.
//
// Поэтому здесь всё делается настоящими запросами к API и сверяется по тому,
// что осталось в базе после них.
//
// Запуск: npm run smoke:money (нужен поднятый стек и посеянные аккаунты).

const API_URL = (process.env.API_URL || "http://127.0.0.1:4001").replace(/\/$/, "");
const OWNER = { phone: process.env.SMOKE_OWNER_PHONE || "+77000000099", password: process.env.SMOKE_OWNER_PASSWORD || "ChangeMe_2026!" };
const DRIVER = { phone: process.env.SMOKE_DRIVER_PHONE || "+77000000000", password: process.env.SMOKE_DRIVER_PASSWORD || "123456" };
const CLIENT = { phone: process.env.SMOKE_CLIENT_PHONE || "+77000000001", password: process.env.SMOKE_CLIENT_PASSWORD || "123456" };

const PICKUP = { lat: 40.84719, lng: 68.503834 };
const DROPOFF = { lat: 40.841873, lng: 68.504185 };

let failures = 0;

function check(condition, message, actual) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${message}${actual === undefined ? "" : ` — получили ${JSON.stringify(actual)}`}`);
  }
}

async function call(path, { method, token, body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

async function login({ phone, password }) {
  const { status, data } = await call("/api/auth/login", { body: { phone, password } });
  if (status !== 200 || !data.token) throw new Error(`не вошли под ${phone}: ${status} ${JSON.stringify(data)}`);
  return data.token;
}

const orderBody = (overrides = {}) => ({
  riderName: "Smoke",
  riderPhone: CLIENT.phone,
  pickupText: "Центр Атакента",
  dropoffText: "Рынок",
  pickupLat: PICKUP.lat,
  pickupLng: PICKUP.lng,
  dropoffLat: DROPOFF.lat,
  dropoffLng: DROPOFF.lng,
  tariff: "Economy",
  paymentMethod: "CASH",
  distanceKm: 2.4,
  durationMin: 6,
  notes: "",
  ...overrides
});

// Незакрытый заказ блокирует следующий, поэтому перед каждым сценарием
// прибираем за собой — и только за собой.
async function clearActiveOrder(clientToken) {
  const { data } = await call("/api/orders/me/active", { token: clientToken });
  const order = data.order;
  if (!order) return;
  await call(`/api/orders/${order.id}/cancel-public`, {
    token: clientToken,
    body: { riderPhone: CLIENT.phone }
  });
}

async function driveToCompletion(orderId, driverToken) {
  for (const step of ["going-to-client", "arrived", "waiting", "start", "complete", "mark-paid"]) {
    const { status, data } = await call(`/api/orders/${orderId}/${step}`, { token: driverToken, body: {} });
    if (status !== 200) throw new Error(`шаг ${step} не прошёл: ${status} ${JSON.stringify(data)}`);
  }
}

async function main() {
  console.log(`Денежные пути, живой прогон против ${API_URL}`);
  const owner = await login(OWNER);
  const driver = await login(DRIVER);
  const client = await login(CLIENT);

  // --- 1. Обычная поездка: комиссия и кэшбэк считаются от цены -------------
  console.log("\n1. Обычная поездка");
  await clearActiveOrder(client);
  {
    const before = (await call("/api/drivers/me/wallet", { token: driver })).data;
    const created = await call("/api/orders", { token: client, body: orderBody() });
    check(created.status === 201, "заказ создан", created.data?.error);
    const order = created.data.order;
    await call(`/api/orders/${order.id}/accept`, { token: driver, body: {} });
    await driveToCompletion(order.id, driver);
    const after = (await call("/api/drivers/me/wallet", { token: driver })).data;
    const debtDelta = Number(after.debtKzt) - Number(before.debtKzt);
    check(debtDelta === Math.round(order.price * 0.07), "комиссия 7% легла в долг водителя", debtDelta);
  }

  // --- 2. Согласованная цена доходит до книг -------------------------------
  // Торг меняет цену после создания заказа. Раньше обновлялась только price,
  // а проводка читает снимок — поездка за 900 попадала в книги как 700.
  console.log("\n2. Согласованная цена в книгах");
  await clearActiveOrder(client);
  {
    const created = await call("/api/orders", { token: client, body: orderBody() });
    const order = created.data.order;
    await call(`/api/orders/${order.id}/price-offer`, { token: driver, body: { priceKzt: Math.round(order.price * 1.2 / 50) * 50 } });
    const seen = (await call("/api/orders/me/active", { token: client })).data.order;
    const accepted = await call(`/api/orders/${order.id}/price-offer/respond`, {
      token: client,
      body: {
        accept: true,
        expectedOffer: {
          driverId: seen.driver_offer_by_driver_id,
          priceKzt: seen.driver_offer_price_kzt,
          proposedBy: seen.driver_offer_proposed_by
        }
      }
    });
    const agreedPrice = accepted.data?.order?.price;
    check(agreedPrice === seen.driver_offer_price_kzt, "цена стала согласованной", agreedPrice);
    await driveToCompletion(order.id, driver);
    // Кошелёк водителя показывает удержание, а не валовую сумму: сверяем
    // удержание с согласованной ценой — если бы в книгу попала прежняя, оно
    // оказалось бы меньше.
    const tx = (await call("/api/drivers/me/wallet/transactions?limit=1", { token: driver })).data;
    const last = (tx.items || [])[0] || {};
    check(last.orderShortId === order.short_id, "смотрим удержание именно за эту поездку", last.orderShortId);
    check(
      Number(last.amountKzt) === Math.round(agreedPrice * 0.07),
      "комиссия удержана с согласованной цены, а не с первоначальной",
      { amountKzt: last.amountKzt, agreedPrice }
    );
  }

  // --- 3. Отменённый заказ возвращает промокод ------------------------------
  console.log("\n3. Промокод после отмены");
  await clearActiveOrder(client);
  {
    const code = `SMOKE${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const regions = (await call("/api/regions")).data.regions || [];
    const region = regions.find(r => r.code === "ATAKENT") || regions[0];
    const promo = await call("/api/admin/promo-codes", {
      token: owner,
      body: {
        code, discountType: "FIXED", discountValue: 100,
        perClientLimit: 1, minOrderPriceKzt: 1, isActive: true, regionId: region.id
      }
    });
    check(promo.status === 201, "промокод заведён", promo.data?.error);
    const first = await call("/api/orders", { token: client, body: orderBody({ promoCode: code }) });
    check(first.status === 201, "заказ с промокодом создан", first.data?.error);
    await call(`/api/orders/${first.data.order.id}/cancel-public`, { token: client, body: { riderPhone: CLIENT.phone } });
    const second = await call("/api/orders", { token: client, body: orderBody({ promoCode: code }) });
    check(second.status === 201, "тот же промокод принимается снова: поездки не было", second.data?.error);
    if (second.data?.order) {
      await call(`/api/orders/${second.data.order.id}/cancel-public`, { token: client, body: { riderPhone: CLIENT.phone } });
    }
    const promoId = promo.data?.promoCode?.id;
    if (promoId) await call(`/api/admin/promo-codes/${promoId}`, { token: owner, method: "DELETE" });
  }

  // --- 4. Заявка на пополнение: одна открытая, и она двигает долг ----------
  console.log("\n4. Пополнение от водителя");
  {
    const wallet = (await call("/api/drivers/me/wallet", { token: driver })).data;
    const debt = Number(wallet.debtKzt);
    if (debt <= 0) {
      console.log("  skip заявка на пополнение: у водителя нет долга, зачитывать нечего");
    } else {
      // Заплатить свой долг можно всегда: нижняя граница опускается до него,
      // иначе долг меньше минимума погасить было бы нечем.
      const amount = Math.min(debt, Number(wallet.minTopupKzt || 500));
      const first = await call("/api/drivers/me/wallet/topup-requests", { token: driver, body: { amountKzt: amount } });
      check(first.status === 201, "заявка создана", first.data?.error);
      const second = await call("/api/drivers/me/wallet/topup-requests", { token: driver, body: { amountKzt: amount } });
      check(second.data?.error === "TOPUP_REQUEST_ALREADY_PENDING", "вторая открытая заявка отказана", second.data?.error);
      const queue = await call("/api/admin/driver-topup-requests?status=PENDING", { token: owner });
      check((queue.data.topupRequests || []).some(t => t.id === first.data.topupRequest.id), "владелец её видит");
      const over = await call(`/api/admin/driver-topup-requests/${first.data.topupRequest.id}`, {
        token: owner, method: "PATCH", body: { status: "COMPLETED", amountKzt: debt + 1000 }
      });
      check(over.data?.error === "TOPUP_EXCEEDS_DEBT", "зачесть больше долга нельзя", over.data?.error);
      const applied = await call(`/api/admin/driver-topup-requests/${first.data.topupRequest.id}`, {
        token: owner, method: "PATCH", body: { status: "COMPLETED", amountKzt: amount }
      });
      check(applied.status === 200, "заявка закрыта зачётом", applied.data?.error);
      const after = (await call("/api/drivers/me/wallet", { token: driver })).data;
      check(Number(after.debtKzt) === debt - amount, "долг уменьшился ровно на зачтённое", after.debtKzt);
    }
  }

  // --- 5. Заблокированный пассажир не заказывает ---------------------------
  console.log("\n5. Блокировка пассажира");
  await clearActiveOrder(client);
  {
    const found = await call(`/api/admin/clients?search=${encodeURIComponent(CLIENT.phone.replace("+", ""))}`, { token: owner });
    const target = (found.data.clients || [])[0];
    check(Boolean(target), "пассажир виден владельцу в панели");
    if (target) {
      await call(`/api/admin/clients/${target.id}/block`, {
        token: owner, method: "PATCH", body: { blocked: true, reason: "smoke" }
      });
      const refused = await call("/api/orders", { token: client, body: orderBody() });
      check(refused.data?.error === "CLIENT_BLOCKED", "заблокированный пассажир не создаёт заказ", refused.data?.error);
      await call(`/api/admin/clients/${target.id}/block`, { token: owner, method: "PATCH", body: { blocked: false } });
      const allowed = await call("/api/orders", { token: client, body: orderBody() });
      check(allowed.status === 201, "после разблокировки заказ снова создаётся", allowed.data?.error);
      if (allowed.data?.order) {
        await call(`/api/orders/${allowed.data.order.id}/cancel-public`, { token: client, body: { riderPhone: CLIENT.phone } });
      }
    }
  }

  console.log(failures === 0 ? "\nMoney flows smoke ok" : `\nMoney flows smoke: ${failures} проверок не прошло`);
  if (failures > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
