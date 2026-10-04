/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
