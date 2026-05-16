import { io } from "socket.io-client";
import { API_URL, getToken } from "./api";
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_URL || window.location.origin).replace(/\/$/, "");
export function createSocket(){
  return io(SOCKET_URL, {
    transports:["websocket", "polling"],
    auth:{ token:getToken() },
    reconnection:true,
    reconnectionAttempts:8
  });
}
