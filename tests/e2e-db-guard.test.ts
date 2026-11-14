import { describe, expect, it } from "vitest";
import { assertE2eDatabaseUrl, databaseNameFromUrl, quoteIdent } from "../e2e/support/e2e-db";

const base = "postgresql://pec:pec@localhost:5433";

describe("assertE2eDatabaseUrl", () => {
  it("accepts a database name ending in _e2e", () => {
    const url = `${base}/pec_market_e2e?schema=public`;
    expect(assertE2eDatabaseUrl(url)).toBe(url);
  });

  it("refuses the dev database", () => {
    expect(() => assertE2eDatabaseUrl(`${base}/pec_market?schema=public`)).toThrow(/does not end in "_e2e"/);
  });

  it("refuses names that only contain _e2e", () => {
    expect(() => assertE2eDatabaseUrl(`${base}/pec_market_e2e_backup`)).toThrow(/does not end in "_e2e"/);
  });

  it("refuses when _e2e appears only in the query string", () => {
    expect(() => assertE2eDatabaseUrl(`${base}/pec_market?x=_e2e`)).toThrow(/does not end in "_e2e"/);
  });

  it("refuses a missing URL, a URL without a database, and garbage", () => {
    expect(() => assertE2eDatabaseUrl(undefined)).toThrow(/not set/);
    expect(() => assertE2eDatabaseUrl("")).toThrow(/not set/);
    expect(() => assertE2eDatabaseUrl(`${base}/`)).toThrow(/no database name/);
    expect(() => assertE2eDatabaseUrl("not a url")).toThrow(/not a valid URL/);
  });
});

describe("helpers", () => {
  it("extracts the database name", () => {
    expect(databaseNameFromUrl(`${base}/pec_market_e2e?schema=public`)).toBe("pec_market_e2e");
  });

  it("quotes identifiers safely", () => {
    expect(quoteIdent("Order")).toBe('"Order"');
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });
});
