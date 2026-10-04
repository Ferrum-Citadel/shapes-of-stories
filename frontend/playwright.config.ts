import { defineConfig } from "@playwright/test";
// The import specs need a synthetic backend on 8001, and the suite keeps to its own ports so it never reaches a dev stack on 5173 and 8000; E2E_PORT and VITE_PROXY_TARGET move it.
const port = process.env.E2E_PORT ?? "5190";
const url = `http://localhost:${port}`;
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: url },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url,
    reuseExistingServer: false,
    env: { VITE_PROXY_TARGET: process.env.VITE_PROXY_TARGET ?? "http://localhost:8001" },
  },
  timeout: 90_000,
});
