// Guarded helpers for the disposable E2E database. Everything here refuses to touch a database
// whose name does not end in "_e2e", so a misconfigured URL can never wipe dev or production data.
import { execSync } from "node:child_process";
import { Client } from "pg";

const E2E_SUFFIX = "_e2e";

/** Returns the database name from a postgres URL, or throws if it is missing/unparseable. */
export function databaseNameFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid URL.");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name) throw new Error("E2E_DATABASE_URL has no database name.");
  return name;
}

/** Hard guard: throws unless the URL is set and its database name ends in "_e2e". Returns the URL. */
export function assertE2eDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("E2E_DATABASE_URL is not set (see .env.example). Refusing to run E2E setup.");
  const name = databaseNameFromUrl(url);
  if (!name.endsWith(E2E_SUFFIX)) {
    throw new Error(
      `Refusing to run E2E setup: database "${name}" does not end in "${E2E_SUFFIX}". ` +
        "E2E setup truncates every table, so it only runs against a disposable *_e2e database.",
    );
  }
  return url;
}

/** Postgres quoting for an identifier (table or database name). */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Creates the E2E database if it does not exist yet (connects to the "postgres" maintenance DB). */
async function ensureDatabaseExists(url: string): Promise<void> {
  const name = databaseNameFromUrl(url);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await client.query(`CREATE DATABASE ${quoteIdent(name)}`);
  } finally {
    await client.end();
  }
}

/** TRUNCATE ... RESTART IDENTITY CASCADE on every app table (everything except Prisma's migration table). */
async function truncateAppTables(url: string): Promise<string[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'",
    );
    const tables = rows.map((r) => r.tablename);
    if (tables.length > 0) {
      await client.query(`TRUNCATE TABLE ${tables.map(quoteIdent).join(", ")} RESTART IDENTITY CASCADE`);
    }
    return tables;
  } finally {
    await client.end();
  }
}

/**
 * Retries a setup step a few times. On a busy host, Postgres in Docker sometimes drops or times out a new connection
 * (ECONNRESET / connect timeout); one retry after a pause gets through. Real errors fail after the last attempt.
 */
async function withRetries<T>(step: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.warn(`[e2e] ${step} failed (attempt ${attempt}/${attempts}): ${(err as Error).message}; retrying`);
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

function runPrisma(args: string, url: string): void {
  execSync(`npx prisma ${args}`, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}

/**
 * migrate deploy → truncate all app tables → seed (unless `seed: false`, used by the Vitest integration suite, whose
 * tests create their own fixtures). Guarded: only ever runs on a *_e2e database.
 */
export async function prepareE2eDatabase(rawUrl: string | undefined, { seed = true }: { seed?: boolean } = {}): Promise<void> {
  const url = assertE2eDatabaseUrl(rawUrl);
  console.log(`[e2e] preparing database "${databaseNameFromUrl(url)}"`);
  await withRetries("create database", () => ensureDatabaseExists(url));
  await withRetries("migrate deploy", async () => runPrisma("migrate deploy", url));
  const truncated = await withRetries("truncate", () => truncateAppTables(url));
  console.log(`[e2e] truncated ${truncated.length} table(s)`);
  if (seed) runPrisma("db seed", url);
}

/** URL of the Vitest integration database: TEST_DATABASE_URL, else E2E_DATABASE_URL with the name pec_market_test_e2e. */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TEST_DATABASE_URL) return assertE2eDatabaseUrl(env.TEST_DATABASE_URL);
  const base = env.E2E_DATABASE_URL ?? env.DATABASE_URL;
  if (!base) throw new Error("Set TEST_DATABASE_URL (or E2E_DATABASE_URL) to run the integration tests.");
  const url = new URL(base);
  url.pathname = "/pec_market_test_e2e";
  return assertE2eDatabaseUrl(url.toString());
}
