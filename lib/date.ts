/** MLB slate "today" uses US Pacific (handles PST/PDT automatically). */
export const SLATE_TIMEZONE = "America/Los_Angeles";

export function getTodayInPacific(): string {
  return formatDateInPacific(new Date());
}

export function formatDateInPacific(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SLATE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return formatDateInPacific(utcNoon);
}
