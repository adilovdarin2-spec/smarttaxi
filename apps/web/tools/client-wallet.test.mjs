import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import {
  createClientWalletController,
  savedCardLabel,
  walletMoney,
  walletDate,
  topupStatus,
} from "../src/features/client/clientWalletState.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const data = () => ({
  summary: { balanceKzt: 1450, currency: "KZT" },
  cards: [{ id: "legacy", maskedCardNumber: "•••• 1234" }],
  topups: [{ id: "old-request", amountKzt: 5000, status: "PENDING" }],
});
function setup(overrides = {}) {
  const changes = [];
  let token = "local-test-session";
  const api = {
    load: async () => data(),
    remove: async () => ({ removed: true }),
    ...overrides,
  };
  const controller = createClientWalletController({
    api,
    readToken: () => token,
    onChange: (next) => changes.push(next),
  });
  return {
    controller,
    changes,
    api,
    setToken: (next) => {
      token = next;
    },
    last: () => changes.at(-1),
  };
}
test("wallet renders unknown amounts/dates honestly and never exposes more than last four card digits", () => {
  for (const value of [null, undefined, "", NaN, "invalid"])
    assert.equal(walletMoney(value), "Сумма уточняется");
  assert.equal(walletMoney(0), "0 ₸");
  assert.equal(walletDate("bad"), "Дата не указана");
  assert.equal(topupStatus("new-status"), "Статус уточняется");
  assert.equal(savedCardLabel("4111111111111111"), "•••• 1111");
});
test("wallet read failure and invalid balance never fabricate a zero balance", async () => {
  for (const result of [
    null,
    { ...data(), summary: {} },
    { ...data(), summary: { balanceKzt: null, currency: "KZT" } },
  ]) {
    const f = setup({ load: async () => result });
    await f.controller.load();
    assert.equal(f.last().data, null);
    assert.match(f.last().error, /баланс не подтверждён/);
  }
});
test("late wallet reads and failures are ignored after logout, replacement session and disposal", async () => {
  for (const end of ["logout", "replacement", "dispose"])
    for (const failure of [false, true]) {
      const pending = deferred(),
        f = setup({ load: () => pending.promise });
      const task = f.controller.load();
      const count = f.changes.length;
      if (end === "dispose") f.controller.dispose();
      else f.setToken(end === "logout" ? "" : "new-session");
      failure ? pending.reject(Error("late")) : pending.resolve(data());
      await task;
      assert.equal(f.changes.length, count);
    }
});
test("latest refresh wins over an older wallet response", async () => {
  const old = deferred();
  let calls = 0;
  const f = setup({
    load: () => (++calls === 1 ? old.promise : Promise.resolve(data())),
  });
  const task = f.controller.load();
  await f.controller.load();
  old.resolve({ ...data(), summary: { balanceKzt: 1, currency: "KZT" } });
  await task;
  assert.equal(f.last().data.summary.balanceKzt, 1450);
});
test("card removal is single-flight and reads the actual server result; no optimistic default card", async () => {
  const pending = deferred();
  let writes = 0,
    reads = 0;
  const f = setup({
    load: async () => {
      reads++;
      return data();
    },
    remove: () => {
      writes++;
      return pending.promise;
    },
  });
  await f.controller.load();
  const task = f.controller.remove("legacy");
  await f.controller.remove("legacy");
  await f.controller.load();
  assert.equal(writes, 1);
  assert.equal(reads, 1);
  pending.resolve({ removed: true });
  await task;
  assert.equal(reads, 2);
  assert.match(f.last().notice, /удалена/);
});
test("uncertain deletion blocks resubmission until a successful read-back", async () => {
  let writes = 0;
  const f = setup({
    remove: async () => {
      writes++;
      throw Error("lost response");
    },
  });
  await f.controller.load();
  await f.controller.remove("legacy");
  await f.controller.remove("legacy");
  assert.equal(writes, 1);
  assert.equal(f.last().uncertain, true);
  f.api.load = async () => {
    throw Error("offline");
  };
  await f.controller.load();
  await f.controller.remove("legacy");
  assert.equal(writes, 1);
  f.api.load = async () => data();
  await f.controller.load();
  assert.equal(f.last().uncertain, false);
});
test("late deletion never reloads using another account and missing acknowledgement is uncertain", async () => {
  const pending = deferred();
  let reads = 0;
  const f = setup({
    load: async () => {
      reads++;
      return data();
    },
    remove: () => pending.promise,
  });
  await f.controller.load();
  const task = f.controller.remove("legacy");
  f.setToken("new-session");
  const count = f.changes.length;
  pending.resolve({ removed: true });
  await task;
  assert.equal(reads, 1);
  assert.equal(f.changes.length, count);
  const invalid = setup({ remove: async () => ({}) });
  await invalid.controller.load();
  await invalid.controller.remove("legacy");
  assert.equal(invalid.last().uncertain, true);
});
test("production wallet has no card entry or funding form; history, error recovery and API scope are real", async () => {
  const oldWindow = globalThis.window,
    oldStorage = globalThis.localStorage,
    oldFetch = globalThis.fetch;
  globalThis.window = { location: { hostname: "127.0.0.1" } };
  globalThis.localStorage = { getItem: () => "local-test-session" };
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const { ClientWalletView, clientWalletApi } = await server.ssrLoadModule(
      "/src/features/client/ClientWalletSection.jsx",
    );
    const render = (state) =>
      renderToStaticMarkup(h(ClientWalletView, { state }));
    const html = render({
      loading: false,
      data: data(),
      error: "",
      removingId: "",
      uncertain: false,
    });
    assert.match(html, /Сохранённые записи карт/);
    assert.match(html, /Ожидает/);
    assert.match(html, /не будут оплачены автоматически/);
    assert.doesNotMatch(
      html,
      /<input|<form|Создать заявку|Добавить карту|Сделать основной/,
    );
    const failed = render({ loading: false, data: null, error: "Нет ответа" });
    assert.match(failed, /Повторить/);
    assert.doesNotMatch(failed, /0 ₸|Доступный кешбэк/);
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      assert.equal(options.headers.Authorization, "Bearer local-test-session");
      const body = url.endsWith("/cards")
        ? { cards: [] }
        : url.endsWith("/topup-requests")
          ? { topupRequests: [] }
          : options.method === "DELETE"
            ? { removed: true }
            : data().summary;
      return { ok: true, json: async () => body };
    };
    await clientWalletApi.load();
    await clientWalletApi.remove("known-id");
    assert.deepEqual(
      requests.map((row) => row.options.method || "GET"),
      ["GET", "GET", "GET", "DELETE"],
    );
    assert.ok(requests.every((row) => !row.options.body));
  } finally {
    await server.close();
    globalThis.window = oldWindow;
    globalThis.localStorage = oldStorage;
    globalThis.fetch = oldFetch;
  }
});
