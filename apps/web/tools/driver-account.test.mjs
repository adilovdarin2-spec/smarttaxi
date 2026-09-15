import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import {
  DRIVER_ACCOUNT_SECTIONS,
  accountStatus,
  accountDate,
  documentFileError,
  latestDriverDocuments,
  walletAmountError,
  walletEntryLabel,
  walletEntryAmount,
  recurringDays,
  accountError,
} from "../src/features/driver/driverAccountModel.js";

test("account covers the real driver resources, without invented unknown status/date", () => {
  assert.equal(new Set(DRIVER_ACCOUNT_SECTIONS.map(([key]) => key)).size, 8);
  assert.equal(accountStatus("PENDING_DRIVER"), "Новый запрос");
  assert.equal(accountStatus("IN_PROGRESS"), "В поездке");
  assert.equal(accountStatus("UNKNOWN_PRIVATE_CODE"), "Статус уточняется");
  assert.equal(accountDate(null), "Дата не указана");
  assert.equal(accountDate("bad-date"), "Дата не указана");
  assert.equal(
    accountError({ message: "database secret" }).includes("secret"),
    false,
  );
  assert.equal(recurringDays([5, 2, 2, 9, 1]), "Пн, Вт, Пт");
});
test("document selection enforces current backend MIME/size and latest submission, not historical approval", () => {
  for (const type of ["image/jpeg", "image/png", "application/pdf"]) {
    assert.equal(documentFileError({ type, size: 8 * 1024 * 1024 }), "");
    assert.notEqual(documentFileError({ type, size: 8 * 1024 * 1024 + 1 }), "");
    assert.notEqual(documentFileError({ type, size: 0 }), "");
  }
  assert.notEqual(documentFileError(null), "");
  assert.notEqual(documentFileError({ type: "text/html", size: 1024 }), "");
  const items = [
    { type: "ID_CARD_FRONT", status: "APPROVED", createdAt: "2026-09-01" },
    { type: "ID_CARD_FRONT", status: "REJECTED", createdAt: "2026-09-09" },
    { type: "UNKNOWN", status: "APPROVED", createdAt: "2026-09-10" },
  ];
  assert.equal(
    latestDriverDocuments(items).get("ID_CARD_FRONT").status,
    "REJECTED",
  );
  assert.equal(
    latestDriverDocuments([...items].reverse()).get("ID_CARD_FRONT").status,
    "REJECTED",
  );
  assert.equal(latestDriverDocuments(items).size, 1);
});
test("wallet form accepts only integral KZT and never presents cash commission as income", () => {
  for (const value of [
    "",
    " ",
    "3000.50",
    "-3000",
    "3e3",
    "Infinity",
    "9007199254740993",
  ])
    assert.notEqual(walletAmountError(value, { minimum: 500 }), "", value);
  assert.equal(
    walletAmountError("3000", { minimum: 3000, available: 3000 }),
    "",
  );
  assert.notEqual(
    walletAmountError("3001", { minimum: 3000, available: 3000 }),
    "",
  );
  assert.notEqual(
    walletAmountError("2999", { minimum: 3000, available: 4000 }),
    "",
  );
  assert.equal(
    walletEntryLabel("CASH_TRIP_COMMISSION"),
    "Комиссия за наличную поездку",
  );
  assert.equal(
    walletEntryAmount({ kind: "CASH_TRIP_COMMISSION", amountKzt: 70 }),
    "70 ₸",
  );
  assert.equal(
    walletEntryAmount({ kind: "EARNING", amountKzt: 630 }),
    "+630 ₸",
  );
});

test("production account screens retain server data, replies, workflow gates and full addresses", async () => {
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  globalThis.window = { location: { hostname: "127.0.0.1" } };
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const screens = await server.ssrLoadModule(
      "/src/features/driver/DriverAccount.jsx",
    );
    const render = (name, props) =>
      renderToStaticMarkup(h(screens[name], props));
    const home = render("DriverAccountHome", {
      driver: { name: "Водитель", phone: "+77000000000" },
    });
    for (const [, name] of DRIVER_ACCOUNT_SECTIONS)
      assert.ok(home.includes(name), name);
    assert.doesNotMatch(home, /Вернуться к текущей поездке/);
    assert.match(
      render("DriverAccountHome", { activeOrder: { id: "active" } }),
      /Вернуться к текущей поездке/,
    );
    const profile = render("DriverAccountProfile", {
      data: {
        driver: {
          name: "Водитель",
          vehicleModel: "Toyota",
          plateNumber: "123 ABC 13",
          isBlocked: true,
        },
      },
    });
    assert.match(profile, /Toyota/);
    assert.match(profile, /123 ABC 13/);
    assert.match(profile, /Профиль заблокирован/);
    const address =
      "улица Бектасова, 12, главный вход со стороны внутреннего двора";
    const history = render("DriverAccountHistory", {
      data: {
        orders: [
          {
            id: "1",
            public_status: "PAYMENT_PENDING",
            pickup_text: address,
            dropoff_text: "улица Кожанова, 34",
            price: 750,
            payment_method: "CASH",
          },
        ],
      },
    });
    assert.ok(history.includes(address));
    assert.match(history, /Ожидает оплату/);
    assert.match(history, /750/);
    assert.match(
      render("DriverAccountRating", { data: { rating: 5, reviewCount: 0 } }),
      /Первые оценки ещё впереди/,
    );
    assert.doesNotMatch(
      render("DriverAccountRating", { data: { rating: 5, reviewCount: 0 } }),
      /5<\/strong>/,
    );
    const replies = render("DriverAccountSupport", {
      data: {
        messages: [
          {
            id: "1",
            topic: "Документы",
            message: "Вопрос водителя",
            status: "RESOLVED",
            adminResponse: "Получили документ. Спасибо!",
            respondedAt: "2026-09-09",
          },
        ],
      },
      api: {},
    });
    assert.match(replies, /Получили документ. Спасибо!/);
    assert.match(replies, /Вопрос водителя/);
    const documents = render("DriverAccountDocuments", {
      data: {
        documents: [
          {
            id: "d",
            type: "DRIVER_LICENSE_FRONT",
            status: "REJECTED",
            rejectionReason: "Фото размыто",
            createdAt: "2026-09-09",
          },
        ],
      },
      api: {},
    });
    assert.match(documents, /Фото размыто/);
    assert.match(documents, /Отправка файла не означает одобрение/);
    assert.match(documents, /accept="image\/jpeg,image\/png,application\/pdf"/);
    const wallet = render("DriverAccountWallet", {
      data: {
        summary: {
          balanceKzt: 1000,
          debtKzt: 0,
          pendingPayoutKzt: 0,
          minPayoutKzt: 3000,
        },
        transactions: { items: [], total: 0 },
        payouts: {
          payoutRequests: [{ id: "p", status: "PAID", amountKzt: 3000 }],
        },
        topups: { topupRequests: [] },
      },
      api: {},
    });
    assert.match(wallet, /disabled=""[^>]*>Вывести/);
    assert.doesNotMatch(wallet, /Отменить заявку/);
    assert.match(wallet, /это не онлайн-оплата/);
    const recurring = (status) =>
      render("DriverAccountRecurring", {
        data: {
          bookings: [
            {
              id: "b",
              status,
              timeOfDay: "08:30",
              daysOfWeek: [1, 3, 5],
              pickupText: address,
              dropoffText: "Школа",
              priceKzt: 700,
            },
          ],
        },
        api: {},
      });
    assert.match(recurring("PENDING_DRIVER"), /Принять маршрут/);
    assert.doesNotMatch(
      recurring("CANCELLED"),
      /Приостановить|Принять маршрут|Возобновить/,
    );
    assert.match(recurring("ACTIVE"), /Приостановить/);
    assert.match(recurring("PAUSED"), /Возобновить/);
    const notifications = render("DriverAccountNotifications", {
      data: {
        notifications: [
          {
            id: "n",
            title: "Сообщение",
            body: "Ответ оператора",
            read_at: "2026-09-09",
          },
        ],
        unreadCount: 0,
      },
      api: {},
    });
    assert.doesNotMatch(notifications, /Прочитать все|Отметить прочитанным/);
    // Exercise the actual API adapter with a recording transport: no network,
    // no authorisation bypass and no mutation of any real wallet or document.
    const calls = [];
    globalThis.localStorage = { getItem: () => "explicit-test-token" };
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({}) };
    };
    const { driverAccountApi: api } = await server.ssrLoadModule(
      "/src/features/driver/driverAccountApi.js",
    );
    await api.documents();
    await api.rating();
    await api.recurring();
    await api.wallet();
    await api.requestTopup(500);
    await api.requestPayout({ amountKzt: 3000, method: "CASH", details: {} });
    await api.sendSupport({
      topic: "Документы",
      message: "Явная тестовая заявка",
      orderId: "fixture",
    });
    await api.uploadDocument(
      "OTHER",
      new Blob(["explicit non-document fixture"], { type: "image/png" }),
    );
    await api.respondRecurring("fixture", true);
    await api.updateRecurring("fixture", "PAUSED");
    const topup = calls.find(
      (call) =>
        call.url.endsWith("/topup-requests") && call.options.method === "POST",
    );
    assert.deepEqual(JSON.parse(topup.options.body), { amountKzt: 500 });
    const payout = calls.find(
      (call) =>
        call.url.endsWith("/payout-requests") && call.options.method === "POST",
    );
    assert.deepEqual(JSON.parse(payout.options.body), {
      amountKzt: 3000,
      method: "CASH",
      details: {},
    });
    const upload = calls.find((call) => call.options.body instanceof FormData);
    assert.equal(
      upload.options.headers["Content-Type"],
      undefined,
      "browser must generate multipart boundary",
    );
    assert.equal(upload.options.body.get("type"), "OTHER");
    assert.ok(
      calls.every(
        (call) =>
          call.options.headers.Authorization === "Bearer explicit-test-token",
      ),
    );
    assert.ok(
      calls.every(
        (call) => !/admin|mark-paid|payment\/|approve/.test(call.url),
      ),
      "account never approves its own transfers/documents",
    );
  } finally {
    await server.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
});
