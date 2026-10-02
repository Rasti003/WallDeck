export function currentTimeSnapshot(now = new Date(), timeZone = "Europe/Warsaw") {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const utcOffset = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(now)
    .find(part => part.type === "timeZoneName")?.value ?? "GMT";
  return {
    timeZone,
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${parts.hour}:${parts.minute}:${parts.second}`,
    weekday: new Intl.DateTimeFormat("pl-PL", { timeZone, weekday: "long" }).format(now),
    formatted: new Intl.DateTimeFormat("pl-PL", { timeZone, dateStyle: "full", timeStyle: "medium" }).format(now),
    utcOffset,
    isoUtc: now.toISOString(),
    unixMs: now.getTime(),
  };
}
