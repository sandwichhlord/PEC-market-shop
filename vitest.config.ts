import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./e2e/support/e2e-db";

// API-level integration tests run against a disposable database (pec_market_test_e2e by default), prepared once per
// run by tests/global-setup.ts (migrate deploy + truncate, guarded to *_e2e names). Uploads go to a temp dir.
const databaseUrl = testDatabaseUrl();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "e2e", ".next"],
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      // Tests never need the real secret; a fixed one keeps them independent of .env.
      JWT_SECRET: "vitest-only-jwt-secret-0123456789abcdef0123456789",
      APP_URL: "http://localhost:3000",
      UPLOAD_DIR: path.join(os.tmpdir(), "pec-market-vitest-uploads"),
    },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
