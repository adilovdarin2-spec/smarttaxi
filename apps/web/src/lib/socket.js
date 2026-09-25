import { io } from "socket.io-client";
import { API_URL, getToken } from "./api";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
export const SOCKET_URL = (isLocalHost ? API_URL : (import.meta.env.VITE_SOCKET_URL || API_URL)).replace(/\/$/, "");
export function createSocket(){
  return io(SOCKET_URL, {
    transports:["polling", "websocket"],
    auth:{ token:getToken() },
    reconnection:true,
    reconnectionAttempts:8
  });
}
