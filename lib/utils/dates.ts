import { getWeek, differenceInCalendarDays } from "date-fns";

export function getWeekNumber(dateStr: string | Date): number {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return getWeek(date, { weekStartsOn: 0 });
}

const HEBREW_WEEKDAY_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];

export function getHebrewWeekdayShort(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return HEBREW_WEEKDAY_SHORT[date.getDay()];
}

export function getHebrewDayRangeLabel(
  startStr: string | Date,
  endStr?: string | Date | null
): string {
  const start = typeof startStr === "string" ? new Date(startStr) : startStr;
  const end = endStr ? (typeof endStr === "string" ? new Date(endStr) : endStr) : start;
  const days = differenceInCalendarDays(end, start) + 1;

  if (days <= 1) return `יום ${getHebrewWeekdayShort(start)}`;

  return `ימים ${getHebrewWeekdayShort(start)}-${getHebrewWeekdayShort(end)} (${days} ימים)`;
}
