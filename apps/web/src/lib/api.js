import { sessionGuard } from './sessionGuard.js';
import {
  readSessionToken,
  removeSessionToken,
  subscribeSessionChanges,
  writeSessionToken,
} from './browserSession.js';

// The public Railway API is the temporary default until the owner points the
// OneDriver domain at its replacement. Vite's development proxy keeps a bare
// local preview same-origin, because the production API correctly rejects an
// arbitrary localhost Origin. Local Docker/phone QA always supplies
// VITE_API_URL explicitly.
const fallbackApiUrl = "https://smarttaxi-api-production-c518.up.railway.app";

const browserOrigin = typeof window !== "undefined" && typeof window.location?.origin === "string"
  ? window.location.origin
  : "";
const localPreviewApiUrl = import.meta.env.DEV && browserOrigin ? browserOrigin : fallbackApiUrl;
export const API_URL = (import.meta.env.VITE_API_URL || localPreviewApiUrl).replace(/\/$/, "");
export function getToken(){ return readSessionToken(); }
export function setToken(token){ writeSessionToken(token); }
export function clearToken(){ removeSessionToken(); }

// A 401 carrying one of these means the credential itself is finished, as
// opposed to a permission problem on one endpoint.
// ACCOUNT_DISABLED — аккаунт выключили, пока страница была открыта. Токен
// после этого мёртв так же, как после входа с другого устройства.
const DEAD_TOKEN_CODES = new Set(["SESSION_SUPERSEDED", "INVALID_TOKEN", "TOKEN_EXPIRED", "UNAUTHORIZED", "ACCOUNT_DISABLED"]);
export { subscribeSessionChanges };
export async function api(path, options = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  // The browser must set the multipart boundary itself. Keeping the JSON
  // header here made every file upload look valid in the UI yet arrive at
  // multer as an empty body.
  const headers = { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  const token = getToken();
  const requestIsCurrent = sessionGuard(token, getToken);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    const message = data.message || data.error || "API request failed";
    const error = new Error(message);
    error.status = response.status;
    error.code = data.error;
    error.details = data.details;
    if (response.status === 401 && DEAD_TOKEN_CODES.has(data.error) && requestIsCurrent()) {
      // The token we sent is no longer accepted, and no amount of retrying
      // will change that. SESSION_SUPERSEDED is another device signing into
      // this account (see common/auth.js's requireAuth); INVALID_TOKEN is a
      // token that no longer verifies at all, which is what every rider gets
      // once theirs passes its seven-day expiry. Both used to be handled
      // differently: only the first dropped the user back to a login screen,
      // so an expired token left the app showing a signed-in home screen
      // whose every request failed silently — an active trip simply became
      // invisible. A delayed response for a previous token must not evict a
      // newer login, which is what requestIsCurrent guards.
      clearToken();
      window.dispatchEvent(new CustomEvent("smarttaxi:session-expired"));
    }
    throw error;
  }
  return data;
}
export async function login(payload) {
  const data = await api("/api/auth/login", { method:"POST", body:JSON.stringify(payload) });
  setToken(data.token);
  return data;
}
