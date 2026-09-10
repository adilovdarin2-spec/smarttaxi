import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_CHANGED_EVENT,
  SESSION_TOKEN_KEY,
  readSessionToken,
  removeSessionToken,
  replaceSessionTokenIfCurrent,
  sessionSnapshotGuard,
  subscribeSessionChanges,
  writeSessionToken,
} from "../src/lib/browserSession.js";
import { clientIdentity, EMPTY_RIDER } from "../src/features/client/clientSession.js";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

test("session writes notify the current document only when the token changes", () => {
  const storage = new MemoryStorage();
  const eventTarget = new EventTarget();
  const changes = [];
  const unsubscribe = subscribeSessionChanges(change => changes.push(change), { storage, eventTarget });

  writeSessionToken("client-token", { storage, eventTarget });
  writeSessionToken("client-token", { storage, eventTarget });
  removeSessionToken({ storage, eventTarget });

  assert.equal(readSessionToken(storage), "");
  assert.deepEqual(changes, [
    { previousToken: "", token: "client-token", source: "same-document" },
    { previousToken: "client-token", token: "", source: "same-document" },
  ]);
  unsubscribe();
  assert.equal(eventTarget.listenerCount?.(SESSION_CHANGED_EVENT), undefined);
});

test("native storage events synchronize another tab and ignore unrelated keys", () => {
  const storage = new MemoryStorage();
  const eventTarget = new EventTarget();
  const changes = [];
  const unsubscribe = subscribeSessionChanges(change => changes.push(change), { storage, eventTarget });

  const unrelated = new Event("storage");
  Object.assign(unrelated, { key: "other", oldValue: "a", newValue: "b", storageArea: storage });
  eventTarget.dispatchEvent(unrelated);

  const replacement = new Event("storage");
  Object.assign(replacement, {
    key: SESSION_TOKEN_KEY,
    oldValue: "driver-token",
    newValue: "client-token",
    storageArea: storage,
  });
  eventTarget.dispatchEvent(replacement);

  assert.deepEqual(changes, [
    { previousToken: "driver-token", token: "client-token", source: "other-document" },
  ]);
  unsubscribe();
});

test("passenger identity accepts only a client role and preserves the base role", () => {
  assert.equal(clientIdentity({ role: "DRIVER", name: "Driver" }), null);
  assert.equal(clientIdentity({ role: "ADMIN", name: "Admin" }), null);
  assert.deepEqual(clientIdentity({
    role: "CLIENT",
    baseRole: "DRIVER",
    name: "Test",
    surname: "Client",
  }, "+77000000001"), {
    name: "Test Client",
    phone: "+77000000001",
    baseRole: "DRIVER",
  });
  assert.deepEqual(EMPTY_RIDER, { name: "Пассажир", phone: "" });
});

test("session snapshot rejects late admin data after login, logout or unmount", () => {
  let token = "owner-token";
  let mounted = true;
  const current = sessionSnapshotGuard(() => token, () => mounted);
  assert.equal(current(), true);
  token = "client-token";
  assert.equal(current(), false);

  const replacement = sessionSnapshotGuard(() => token, () => mounted);
  mounted = false;
  assert.equal(replacement(), false);

  mounted = true;
  token = "";
  const anonymous = sessionSnapshotGuard(() => token, () => mounted);
  assert.equal(anonymous(), true);
  token = "driver-token";
  assert.equal(anonymous(), false);
});

test("a late authentication response cannot overwrite a replacement session", () => {
  let token = "owner-token";
  const writes = [];
  const options = {
    readToken: () => token,
    writeToken: nextToken => {
      token = nextToken;
      writes.push(nextToken);
    }
  };

  assert.equal(replaceSessionTokenIfCurrent("owner-token", "driver-token", options), true);
  assert.deepEqual(writes, ["driver-token"]);

  token = "client-token";
  assert.equal(replaceSessionTokenIfCurrent("driver-token", "stale-token", options), false);
  assert.equal(token, "client-token");
  assert.deepEqual(writes, ["driver-token"]);
});
