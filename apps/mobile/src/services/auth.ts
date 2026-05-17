import * as SecureStore from "expo-secure-store";
import { api, setApiToken } from "./api";

const TOKEN_KEY = "smarttaxi_mobile_token";
const USER_KEY = "smarttaxi_mobile_user";

export type UserRole = "OWNER" | "OPERATOR" | "FINANCE" | "DRIVER" | "CLIENT";

export type User = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
};

export async function restoreSession() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const userRaw = await SecureStore.getItemAsync(USER_KEY);
  if (!token || !userRaw) return null;
  setApiToken(token);
  return { token, user: JSON.parse(userRaw) as User };
}

export async function loginWithEmail(email: string, password: string) {
  const data = await api<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  await saveSession(data.token, data.user);
  return data;
}

export async function loginWithPhone(phone: string, password: string) {
  const data = await api<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password })
  });
  await saveSession(data.token, data.user);
  return data;
}

export async function saveSession(token: string, user: User) {
  setApiToken(token);
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function logout() {
  setApiToken("");
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
