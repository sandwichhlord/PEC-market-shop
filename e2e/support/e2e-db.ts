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

function runPrisma(args: string, url: string): void {
  execSync(`npx prisma ${args}`, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}

/** migrate deploy → truncate all app tables → seed. Guarded: only ever runs on a *_e2e database. */
export async function prepareE2eDatabase(rawUrl: string | undefined): Promise<void> {
  const url = assertE2eDatabaseUrl(rawUrl);
  console.log(`[e2e] preparing database "${databaseNameFromUrl(url)}"`);
  await ensureDatabaseExists(url);
  runPrisma("migrate deploy", url);
  const truncated = await truncateAppTables(url);
  console.log(`[e2e] truncated ${truncated.length} table(s)`);
  runPrisma("db seed", url);
}
