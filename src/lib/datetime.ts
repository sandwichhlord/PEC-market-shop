// Display formatting for timestamps. The market is in India, so times are always shown in IST.
const DATE_TIME = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function formatDateTime(date: Date | string): string {
  return DATE_TIME.format(typeof date === "string" ? new Date(date) : date);
}

const DATE = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

/** Date only (e.g. "15 Nov 2026"), in IST. */
export function formatDate(date: Date | string): string {
  return DATE.format(typeof date === "string" ? new Date(date) : date);
}

const TIME =new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Time of day only (e.g. "4:35 pm"), in IST — for estimates and timeline entries on the same day. */
export function formatTime(date: Date | string): string {
  return TIME.format(typeof date === "string" ? new Date(date) : date);
}
