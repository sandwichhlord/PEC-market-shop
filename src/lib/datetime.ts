// Display formatting for timestamps. The market is in India, so times are always shown in IST.
const DATE_TIME = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function formatDateTime(date: Date | string): string {
  return DATE_TIME.format(typeof date === "string" ? new Date(date) : date);
}
