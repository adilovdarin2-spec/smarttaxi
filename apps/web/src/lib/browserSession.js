export const SESSION_TOKEN_KEY = "smarttaxi_token";
export const SESSION_CHANGED_EVENT = "smarttaxi:session-changed";

export function readSessionToken(storage = localStorage) {
  return storage.getItem(SESSION_TOKEN_KEY) || "";
}

function notifySessionChange({ eventTarget, previousToken, token }) {
  if (previousToken === token) return;
  eventTarget.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, {
    detail: { previousToken, token, source: "same-document" },
  }));
}

export function writeSessionToken(token, {
  storage = localStorage,
  eventTarget = window,
} = {}) {
  const previousToken = readSessionToken(storage);
  const nextToken = typeof token === "string" ? token : "";
  if (nextToken) storage.setItem(SESSION_TOKEN_KEY, nextToken);
  else storage.removeItem(SESSION_TOKEN_KEY);
  notifySessionChange({ eventTarget, previousToken, token: nextToken });
}

export function removeSessionToken({
  storage = localStorage,
  eventTarget = window,
} = {}) {
  writeSessionToken("", { storage, eventTarget });
}

export function subscribeSessionChanges(listener, {
  storage = localStorage,
  eventTarget = window,
} = {}) {
  const onLocalChange = event => listener({
    previousToken: event.detail?.previousToken || "",
    token: event.detail?.token || readSessionToken(storage),
    source: "same-document",
  });
  const onStorageChange = event => {
    if (event.key !== SESSION_TOKEN_KEY) return;
    if (event.storageArea && event.storageArea !== storage) return;
    listener({
      previousToken: event.oldValue || "",
      token: event.newValue || "",
      source: "other-document",
    });
  };

  eventTarget.addEventListener(SESSION_CHANGED_EVENT, onLocalChange);
  eventTarget.addEventListener("storage", onStorageChange);
  return () => {
    eventTarget.removeEventListener(SESSION_CHANGED_EVENT, onLocalChange);
    eventTarget.removeEventListener("storage", onStorageChange);
  };
}

export function sessionSnapshotGuard(readToken, isAlive = () => true) {
  const token = readToken();
  return () => isAlive() && readToken() === token;
}
