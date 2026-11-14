// Generates simple, self-contained SVG placeholder images (no network, no fonts to download).

/** Escapes text for use inside SVG/XML content and attribute values. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Up to two uppercase initials from a name ("Chai Point" → "CP"). */
export function initials(name: string): string {
  const words = name.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export interface PlaceholderOptions {
  /** Main label (dish or shop name). */
  label: string;
  /** Background colour, e.g. "#f59e0b". */
  color: string;
  /** "logo" = square with initials; "dish" = 4:3 plate with the name. */
  kind: "logo" | "dish";
}

/** Returns an SVG document string. Deterministic for the same input. */
export function placeholderSvg({ label, color, kind }: PlaceholderOptions): string {
  const safeLabel = escapeXml(label);
  const safeColor = escapeXml(color);
  if (kind === "logo") {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="${safeLabel}">`,
      `<rect width="256" height="256" rx="48" fill="${safeColor}"/>`,
      `<circle cx="128" cy="128" r="84" fill="#ffffff" fill-opacity="0.18"/>`,
      `<text x="128" y="128" dy="0.35em" text-anchor="middle" font-family="system-ui, sans-serif" font-size="88" font-weight="700" fill="#ffffff">${escapeXml(initials(label))}</text>`,
      `</svg>`,
    ].join("");
  }
  const display = label.length > 22 ? `${label.slice(0, 21)}…` : label;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="${safeLabel}">`,
    `<rect width="640" height="480" fill="${safeColor}"/>`,
    `<circle cx="320" cy="210" r="130" fill="#ffffff" fill-opacity="0.9"/>`,
    `<circle cx="320" cy="210" r="96" fill="${safeColor}" fill-opacity="0.35"/>`,
    `<text x="320" y="210" dy="0.35em" text-anchor="middle" font-family="system-ui, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${escapeXml(initials(label))}</text>`,
    `<text x="320" y="420" text-anchor="middle" font-family="system-ui, sans-serif" font-size="40" font-weight="600" fill="#ffffff">${escapeXml(display)}</text>`,
    `</svg>`,
  ].join("");
}
