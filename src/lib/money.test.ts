import { describe, expect, it } from "vitest";
import { formatPaise } from "./money";

describe("formatPaise", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatPaise(12000, "inr")).toBe("₹120");
  });

  it("formats paise with two decimals", () => {
    expect(formatPaise(12050, "inr")).toBe("₹120.50");
  });

  it("uses Indian digit grouping", () => {
    expect(formatPaise(12345600, "inr")).toBe("₹1,23,456");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatPaise(10.5, "inr")).toThrow(TypeError);
  });
});
