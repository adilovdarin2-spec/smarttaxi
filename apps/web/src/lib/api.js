export const API_URL = (import.meta.env.VITE_API_URL || "https://api.smarttaxi.kz").replace(/\/$/, "");
export function getToken(){ return localStorage.getItem("smarttaxi_token") || ""; }
export function setToken(token){ localStorage.setItem("smarttaxi_token", token); }
export function clearToken(){ localStorage.removeItem("smarttaxi_token"); }
export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    const message = data.message || data.error || "API request failed";
    const error = new Error(message);
    error.code = data.error;
    error.details = data.details;
    throw error;
  }
  return data;
}
export async function login(payload) {
  const data = await api("/api/auth/login", { method:"POST", body:JSON.stringify(payload) });
  setToken(data.token);
  return data;
}
