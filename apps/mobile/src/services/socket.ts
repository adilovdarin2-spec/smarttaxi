import { io, Socket } from "socket.io-client";
import { API_URL, getApiToken } from "./api";

export function createSmartTaxiSocket(): Socket {
  return io(API_URL, {
    transports: ["websocket", "polling"],
    auth: { token: getApiToken() },
    reconnection: true,
    reconnectionAttempts: 8
  });
}
