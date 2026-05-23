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

export function getPacificTimeParts(date: Date = new Date()): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SLATE_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
  };
}

/** Best Bets selection runs at/after 8:00 AM Pacific. */
export function isAfter8amPacific(date: Date = new Date()): boolean {
  const { hour, minute } = getPacificTimeParts(date);
  return hour > 8 || (hour === 8 && minute >= 0);
}
