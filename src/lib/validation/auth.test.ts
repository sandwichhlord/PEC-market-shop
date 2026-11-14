import { describe, expect, it } from "vitest";
import { customerSignupSchema, loginSchema, shopSignupSchema } from "./auth";

const base = { name: "  Aarav  ", email: " Aarav@PEC.test ", password: "longenough" };

describe("customerSignupSchema", () => {
  it("trims and lower-cases", () => {
    expect(customerSignupSchema.parse(base)).toEqual({ name: "Aarav", email: "aarav@pec.test", password: "longenough" });
  });

  it.each([
    ["", undefined],
    ["98765 00001", "9876500001"],
    ["+91-98765-00001", "+919876500001"],
  ])("normalises phone %j → %j", (phone, expected) => {
    expect(customerSignupSchema.parse({ ...base, phone }).phone).toBe(expected);
  });

  it.each(["12", "phone", "+1234567890123456"])("rejects phone %j", (phone) => {
    expect(customerSignupSchema.safeParse({ ...base, phone }).success).toBe(false);
  });

  it("enforces password length 8–72", () => {
    expect(customerSignupSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(customerSignupSchema.safeParse({ ...base, password: "x".repeat(73) }).success).toBe(false);
  });
});

describe("shopSignupSchema", () => {
  it("defaults the description and requires a location", () => {
    const shop = { ...base, shopName: "Chai Point", location: "Stall 4" };
    expect(shopSignupSchema.parse(shop).shopDescription).toBe("");
    expect(shopSignupSchema.safeParse({ ...shop, location: " " }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts short seed passwords but requires a known portal", () => {
    expect(loginSchema.parse({ email: "shop1@pec.test", password: "shop123", portal: "shop" }).portal).toBe("shop");
    expect(loginSchema.safeParse({ email: "shop1@pec.test", password: "shop123", portal: "x" }).success).toBe(false);
  });
});
