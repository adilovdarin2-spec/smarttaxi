import { sessionGuard } from './sessionGuard.js';

const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const fallbackApiUrl = isLocalHost
  ? "http://127.0.0.1:4000"
  : "https://api.smarttaxi.kz";

export const API_URL = (import.meta.env.VITE_API_URL || fallbackApiUrl).replace(/\/$/, "");
export function getToken(){ return localStorage.getItem("smarttaxi_token") || ""; }
export function setToken(token){ localStorage.setItem("smarttaxi_token", token); }
export function clearToken(){ localStorage.removeItem("smarttaxi_token"); }
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
    if (response.status === 401 && data.error === "SESSION_SUPERSEDED" && requestIsCurrent()) {
      // Backend rotated session_version because another device just logged
      // into this account (see common/auth.js's requireAuth) -- every
      // token issued before that is now rejected. Without this, whichever
      // admin/driver/client web tab was open just shows this one request's
      // error inline instead of dropping the user back to a login screen,
      // and keeps quietly failing every request after it the same way.
      // A delayed response for a previous token must not evict a newer login.
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
