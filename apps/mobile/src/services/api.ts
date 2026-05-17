export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://api.smarttaxi.kz").replace(/\/$/, "");

export type ApiError = Error & { code?: string; details?: unknown };

let authToken = "";

export function setApiToken(token: string) {
  authToken = token;
}

export function getApiToken() {
  return authToken;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {})
  };

  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || data.error || "API request failed") as ApiError;
    error.code = data.error;
    error.details = data.details;
    throw error;
  }

  return data as T;
}

export function humanError(error: unknown) {
  const err = error as ApiError;
  if (err.code === "ORDER_ALREADY_ACCEPTED") return "Заказ уже принял другой водитель.";
  if (err.code === "DRIVER_NOT_AVAILABLE") return "Сначала включите статус онлайн.";
  if (err.code === "DRIVER_HAS_ACTIVE_ORDER") return "У вас уже есть активная поездка.";
  if (err.code === "INVALID_STATUS_TRANSITION") return "Этот шаг недоступен для текущего статуса заказа.";
  if (err.code === "FORBIDDEN_ORDER") return "Нельзя управлять чужим заказом.";
  if (String(err.message || "").includes("Network request failed")) return "API не отвечает. Проверьте EXPO_PUBLIC_API_URL.";
  return err.message || "Что-то пошло не так.";
}
