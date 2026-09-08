import { addDays, eachDayOfInterval, isSameDay, startOfWeek } from "date-fns";
import { todayIsoDate, APP_TIME_ZONE } from "@/lib/utils/registration-lock";

/**
 * THE calendar's anchor date — one definition, consumed by every view.
 *
 * TWO THINGS THIS FIXES.
 *
 * 1. EACH VIEW USED TO PICK ITS OWN STARTING POINT, and none of them picked the current
 *    week: the month grid was built from `startOfMonth()`, the agenda listed every item
 *    from the earliest one in the dataset, and the gantt's range began at the earliest
 *    item's start date. Switching views could not preserve an anchor because there was no
 *    anchor to preserve. `CalendarClient` now owns one and passes it down.
 *
 * 2. "TODAY" IS ASIA/JERUSALEM'S TODAY, NOT THE HOST'S. These are client components, so
 *    Next renders them on the server too — and a server running in UTC resolves 00:15
 *    Israel time to the PREVIOUS day, anchoring the calendar to the wrong week and
 *    tripping a hydration mismatch on top of it. The zone comes from
 *    `lib/utils/registration-lock.ts` rather than a second constant, because the app must
 *    not grow two ideas of what day it is.
 *
 * THE WEEK IS SUNDAY→SATURDAY, always passed explicitly. date-fns defaults to Monday, and
 * a default that happens to be wrong here is the kind of thing that silently returns.
 */

/** The Israeli week starts on Sunday. Never rely on the library default. */
export const WEEK_STARTS_ON = 0 as const;

export { APP_TIME_ZONE };

/** Today's calendar date in Asia/Jerusalem, as 'yyyy-MM-dd'. Identical on server and
 * client whatever their host timezone, which is what keeps hydration stable. */
export function appTodayIso(now: Date = new Date()): string {
  return todayIsoDate(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A 'yyyy-MM-dd' civil date → a Date at LOCAL midnight on that day.
 *
 * Deliberately not `new Date(iso)`, which parses a bare ISO date as UTC midnight and then
 * displays as the previous day for anyone west of Greenwich. Every calculation downstream
 * (week boundaries, day grids, formatting) is calendar arithmetic on a civil date, so a
 * local-midnight Date is the representation that keeps it correct.
 *
 * Returns null for anything malformed, so a hand-typed `?date=` cannot produce an Invalid
 * Date that silently poisons every comparison.
 */
export function civilDate(iso: string | null | undefined): Date | null {
  if (typeof iso !== "string" || !ISO_DATE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // Rejects real-looking but impossible dates ("2026-02-31" rolls over to March).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Today in Asia/Jerusalem, as a local-midnight Date. */
export function appToday(now: Date = new Date()): Date {
  return civilDate(appTodayIso(now)) as Date;
}

/** The Sunday that opens the week containing `date`. */
export function weekStartOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
}

/**
 * The seven days of the week containing `date`, Sunday→Saturday.
 *
 * It is NOT clamped to the date's month: the week of the 31st legitimately runs into the
 * next month, and clipping it would hide half the days a user came to look at.
 */
export function weekDaysOf(date: Date): Date[] {
  const start = weekStartOf(date);
  return eachDayOfInterval({ start, end: addDays(start, 6) });
}

/** True when both dates fall in the same Sunday→Saturday week. Works across month and
 * year boundaries, because it compares week STARTS rather than week numbers. */
export function isSameCalendarWeek(a: Date, b: Date): boolean {
  return isSameDay(weekStartOf(a), weekStartOf(b));
}

/**
 * The anchor a fresh entry to the calendar should use.
 *
 * An explicit `?date=` wins — a shared or bookmarked link must open where it says. Anything
 * else, including a malformed param, falls back to today: a stale value must never keep a
 * new session away from the current week.
 */
export function resolveAnchorIso(
  urlDate: string | null | undefined,
  todayIso: string
): string {
  return civilDate(urlDate) ? (urlDate as string) : todayIso;
}
