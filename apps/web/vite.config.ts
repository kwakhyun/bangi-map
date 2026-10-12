import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium/") },
  server: { proxy: { "/api": "http://127.0.0.1:8080" } },
  preview: {
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self' data: blob: https://tile.openstreetmap.org; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/cesium/") || id.includes("/@cesium/"))
            return "cesium";
          if (id.includes("/three/")) return "three";
        },
      },
    },
  },
});
