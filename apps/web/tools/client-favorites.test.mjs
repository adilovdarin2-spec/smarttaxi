import assert from "node:assert/strict";
import test from "node:test";
import {
  createClientFavoritesController,
  sameFavoriteAddress,
  validFavoriteList,
} from "../src/features/client/clientFavoritesState.js";

const row = (overrides = {}) => ({
  id: "favorite-1",
  label: "OTHER",
  title: "Дом",
  addressText: "Улица, 10",
  lat: 42.31,
  lng: 69.59,
  ...overrides,
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const networkError = () => new TypeError("Failed to fetch");

function fixture(overrides = {}) {
  let token = "session-a";
  const changes = [];
  const api = {
    load: async () => ({ addresses: [row()] }),
    create: async (payload) => ({ address: row({ ...payload, id: "created" }) }),
    remove: async () => ({}),
    ...overrides,
  };
  const controller = createClientFavoritesController({
    api,
    readToken: () => token,
    onChange: (state) => changes.push(state),
  });
  return {
    api,
    changes,
    controller,
    last: () => changes.at(-1),
    setToken: (value) => {
      token = value;
    },
  };
}

test("favorite list and exact reconciliation never accept fabricated coordinates", () => {
  assert.deepEqual(validFavoriteList({ addresses: [row()] }), [row()]);
  for (const data of [null, {}, { addresses: null }, { addresses: "bad" }]) {
    assert.throws(() => validFavoriteList(data));
  }
  assert.throws(() => validFavoriteList({ addresses: [row({ lat: "bad" })] }));
  const payload = row({ id: undefined });
  assert(sameFavoriteAddress(row(), payload));
  assert(!sameFavoriteAddress(row({ lat: 42.4 }), payload));
  assert(!sameFavoriteAddress(row({ addressText: "Другая улица" }), payload));
});

test("late favorite reads cannot populate a replacement account or disposed page", async () => {
  for (const end of ["logout", "replacement", "dispose"]) {
    const pending = deferred();
    const f = fixture({ load: () => pending.promise });
    const task = f.controller.load();
    const count = f.changes.length;
    if (end === "dispose") f.controller.dispose();
    else f.setToken(end === "logout" ? "" : "session-b");
    pending.resolve({ addresses: [row()] });
    await task;
    assert.equal(f.changes.length, count);
  }
});

test("confirmed create and delete update from acknowledgements without an extra read", async () => {
  let reads = 0;
  const f = fixture({
    load: async () => {
      reads += 1;
      return { addresses: [row()] };
    },
  });
  await f.controller.load();
  assert.equal((await f.controller.create(row({ id: undefined }))).status, "confirmed");
  assert.equal(f.last().favorites[0].id, "created");
  assert.equal((await f.controller.remove("created")).status, "confirmed");
  assert(!f.last().favorites.some((item) => item.id === "created"));
  assert.equal(reads, 1);
});

test("a lost create response reconciles once and never replays POST", async () => {
  let creates = 0;
  let reads = 0;
  const payload = row({ id: undefined });
  const f = fixture({
    create: async () => {
      creates += 1;
      throw networkError();
    },
    load: async () => {
      reads += 1;
      return { addresses: [row({ id: "server-created" })] };
    },
  });
  const result = await f.controller.create(payload);
  assert.equal(result.status, "recovered");
  assert.equal(creates, 1);
  assert.equal(reads, 1);
  assert.equal(f.last().uncertain, false);
});

test("a mismatched create acknowledgement requires an authoritative read", async () => {
  let creates = 0;
  let reads = 0;
  const payload = row({ id: undefined });
  const f = fixture({
    create: async () => {
      creates += 1;
      return { address: row({ id: "wrong", addressText: "Другая улица, 5" }) };
    },
    load: async () => {
      reads += 1;
      return { addresses: [row({ id: "server-created" })] };
    },
  });
  assert.equal((await f.controller.create(payload)).status, "recovered");
  assert.equal(creates, 1);
  assert.equal(reads, 1);
  assert.equal(f.last().favorites[0].id, "server-created");
});

test("unconfirmed create blocks resubmission until a successful explicit refresh", async () => {
  let creates = 0;
  let committed = false;
  const payload = row({ id: undefined });
  const f = fixture({
    create: async () => {
      creates += 1;
      throw networkError();
    },
    load: async () => ({ addresses: committed ? [row()] : [] }),
  });
  assert.equal((await f.controller.create(payload)).status, "uncertain");
  assert.equal(f.last().uncertain, true);
  assert.equal((await f.controller.create(payload)).status, "blocked");
  assert.equal(creates, 1);
  committed = true;
  assert.equal((await f.controller.load()).status, "confirmed");
  assert.equal(f.last().uncertain, false);
});

test("a lost or 404 delete response is success only when read-back proves absence", async () => {
  for (const failure of [networkError(), Object.assign(Error("missing"), { status: 404 })]) {
    let deletes = 0;
    const seeded = fixture({
      remove: async () => {
        deletes += 1;
        throw failure;
      },
      load: async () => ({ addresses: deletes ? [] : [row()] }),
    });
    await seeded.controller.load();
    assert.equal((await seeded.controller.remove("favorite-1")).status, "recovered");
    assert.equal(deletes, 1);
    assert.equal(seeded.last().favorites.length, 0);
  }
});

test("late favorite write never reads or updates a replacement account", async () => {
  const pending = deferred();
  let reads = 0;
  const f = fixture({
    create: () => pending.promise,
    load: async () => {
      reads += 1;
      return { addresses: [] };
    },
  });
  const task = f.controller.create(row({ id: undefined }));
  const count = f.changes.length;
  f.setToken("session-b");
  pending.reject(networkError());
  assert.equal((await task).status, "stale");
  assert.equal(reads, 0);
  assert.equal(f.changes.length, count);
});
