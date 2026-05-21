const MLB_TZ = "America/New_York";

/** Format MLB gameDate ISO string as "7:05 PM ET". */
export function formatStartTimeET(isoDate: string | null | undefined): string {
  if (!isoDate?.trim()) return "TBD";

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "TBD";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MLB_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute =
    parts.find((p) => p.type === "minute")?.value?.padStart(2, "0") ?? "00";
  const dayPeriod =
    parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase() ?? "";

  if (!hour || !dayPeriod) return "TBD";

  return `${hour}:${minute} ${dayPeriod} ET`;
}
