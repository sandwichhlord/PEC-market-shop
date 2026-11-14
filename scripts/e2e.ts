// Runs Playwright against a freshly reset pec_market_e2e database with mock payments.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const e2eUrl = process.env.E2E_DATABASE_URL;
if (!e2eUrl) {
  console.error("E2E_DATABASE_URL is not set (see .env.example).");
  process.exit(1);
}

const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: e2eUrl,
  PAYMENTS_PROVIDER: "mock",
  E2E_PORT: process.env.E2E_PORT ?? "3100",
};
env.APP_URL = `http://localhost:${env.E2E_PORT}`;

function run(cmd: string, args: string[], extraEnv: Partial<NodeJS.ProcessEnv> = {}): void {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  // One command string (not cmd + args) so the shell can resolve npx on Windows without DEP0190.
  const result = spawnSync(`${cmd} ${args.join(" ")}`, { stdio: "inherit", shell: true, env: { ...env, ...extraEnv } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["prisma", "migrate", "reset", "--force"]);
run("npx", ["prisma", "db", "seed"]);
run("npx", ["next", "build"], { NODE_ENV: "production" });
run("npx", ["playwright", "test", ...process.argv.slice(2)]);
