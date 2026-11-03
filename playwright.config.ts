import { defineConfig } from "@playwright/test";

// E2E against the real Docker stack (see test/e2e/README.md).
export default defineConfig({
  testDir: "test/e2e",
  timeout: 90_000,
  retries: 1,
  workers: 1, // the stack is single-instance; serial avoids rate-limit noise
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "es-ES",
  },
  reporter: [["list"]],
});
