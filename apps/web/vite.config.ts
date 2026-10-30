import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev: /api and /mcp proxy to the local Worker (wrangler dev) unless VITE_API_MODE=mock.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_TARGET || "http://127.0.0.1:8787";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target, changeOrigin: true, ws: true },
        "/mcp": { target, changeOrigin: true },
      },
    },
    build: { outDir: "dist", sourcemap: false },
  };
});
