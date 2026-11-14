import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// The app under test always talks to the disposable E2E database, which e2e/global-setup.ts migrates,
// empties and seeds (guarded to *_e2e names). `npm run e2e` builds the app first; it runs in production mode.
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx server.ts",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      PORT: String(port),
      APP_URL: baseURL,
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      PAYMENTS_PROVIDER: "mock",
    },
  },
});
