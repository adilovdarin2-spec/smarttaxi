import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Keep the booking surface responsive on slower phones.  MapLibre is only
// needed after the client route is opened, so it must not be bundled together
// with React, sockets and the public landing page.
export default defineConfig({
  plugins: [react()],
  server: {
    // Railway keeps a strict origin allow-list in production. Proxying only
    // Vite development traffic preserves that protection and lets a bare
    // localhost preview exercise the temporary API without a CORS bypass.
    proxy: {
      "/api": {
        target: "https://smarttaxi-api-production-c518.up.railway.app",
        changeOrigin: true,
        secure: true,
      },
      "/socket.io": {
        target: "wss://smarttaxi-api-production-c518.up.railway.app",
        changeOrigin: true,
        ws: true,
        secure: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("maplibre-gl")) return "maplibre";
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) return "realtime";
          if (id.includes("react-dom") || id.includes("/react/")) return "react";
          return "vendor";
        },
      },
    },
  },
});
