/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Library code changes less often than the app, so it gets chunks of its own that stay cached across releases.
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          /node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)
            ? "react"
            : /node_modules\/d3-/.test(id)
              ? "d3"
              : undefined,
      },
    },
  },
  server: { proxy: { "/api": process.env.VITE_PROXY_TARGET ?? "http://localhost:8000" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
    unstubGlobals: true,
    restoreMocks: true,
    exclude: ["e2e/**", "node_modules/**"],
  },
});
