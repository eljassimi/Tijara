import { appTimeZone } from "@/lib/time";

type Cutoffs = { weekdayCutoff: string; saturdayCutoff: string };

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function cutoffMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function calculateShipDate(now: Date, cutoffs: Cutoffs) {
  const local = localParts(now);
  const base = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const afterCutoff =
    local.weekday === "Sat"
      ? local.minutes >= cutoffMinutes(cutoffs.saturdayCutoff)
      : local.minutes >= cutoffMinutes(cutoffs.weekdayCutoff);
  let days = local.weekday === "Sun" ? 1 : afterCutoff ? 1 : 0;
  const candidateWeekday = new Date(
    base.getTime() + days * 86_400_000,
  ).getUTCDay();
  if (candidateWeekday === 0) days += 1;
  return new Date(base.getTime() + days * 86_400_000);
}
