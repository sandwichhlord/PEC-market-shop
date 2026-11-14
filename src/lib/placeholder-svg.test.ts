import { describe, expect, it } from "vitest";
import { escapeXml, initials, placeholderSvg } from "./placeholder-svg";

describe("placeholder SVGs", () => {
  it("escapes XML special characters", () => {
    expect(escapeXml(`Tom & Jerry's <"best">`)).toBe("Tom &amp; Jerry&apos;s &lt;&quot;best&quot;&gt;");
  });

  it("takes up to two initials", () => {
    expect(initials("Chai Point")).toBe("CP");
    expect(initials("masala dosa special")).toBe("MD");
    expect(initials("Juice")).toBe("J");
    expect(initials("Bun-Maska")).toBe("BM");
  });

  it("produces a deterministic, escaped SVG document", () => {
    const a = placeholderSvg({ label: "Bread & Butter", color: "#f59e0b", kind: "dish" });
    expect(a).toBe(placeholderSvg({ label: "Bread & Butter", color: "#f59e0b", kind: "dish" }));
    expect(a.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"")).toBe(true);
    expect(a).toContain("Bread &amp; Butter");
    expect(a).not.toContain("Bread & Butter");
    expect(placeholderSvg({ label: "Chai Point", color: "#000", kind: "logo" })).toContain(">CP</text>");
  });
});
