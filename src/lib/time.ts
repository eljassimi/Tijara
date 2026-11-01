import { brand } from "@/config/brand";

export const appTimeZone = brand.timezone;

export function formatAppDateTime(
  value: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  },
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: appTimeZone,
    ...options,
  }).format(value);
}

export function formatAppDate(
  value: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: appTimeZone,
    ...options,
  }).format(value);
}

/** Format a Date as `YYYY-MM-DDTHH:mm` using UTC components. */
export function gmtDateTimeLocalValue(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}
