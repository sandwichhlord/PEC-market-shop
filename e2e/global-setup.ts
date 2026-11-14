import { prepareE2eDatabase } from "./support/e2e-db";

/** Playwright global setup: migrated, emptied and seeded pec_market_e2e before every run. */
export default async function globalSetup(): Promise<void> {
  await prepareE2eDatabase(process.env.E2E_DATABASE_URL);
}
