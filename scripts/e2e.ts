// `npm run e2e`: production build, then Playwright. Database prep (migrate deploy → TRUNCATE → seed,
// guarded to *_e2e databases) happens in e2e/global-setup.ts.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { assertE2eDatabaseUrl } from "../e2e/support/e2e-db";

// Fail fast, before the slow build, if the URL is not a disposable *_e2e database.
assertE2eDatabaseUrl(process.env.E2E_DATABASE_URL);

function run(command: string, extraEnv: Partial<NodeJS.ProcessEnv> = {}): void {
  console.log(`\n$ ${command}`);
  // One command string with shell: true so npx resolves on Windows (avoids Node's DEP0190 warning).
  const result = spawnSync(command, { stdio: "inherit", shell: true, env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx next build", { NODE_ENV: "production" });
run(["npx playwright test", ...process.argv.slice(2)].join(" "));
