import { prepareE2eDatabase, testDatabaseUrl } from "../e2e/support/e2e-db";

/** Vitest global setup: a migrated, empty integration database (guarded to *_e2e names). */
export default async function setup(): Promise<void> {
  await prepareE2eDatabase(testDatabaseUrl(), { seed: false });
}
