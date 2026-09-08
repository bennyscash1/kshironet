/**
 * The registration lock on a certification — one moment for every battalion.
 *
 * STORAGE (migration 021 + 022)
 *   certifications.registration_lock_date  TEXT 'yyyy-MM-dd'   — the closing day
 *   certifications.registration_lock_hour  SMALLINT 0..23      — the closing hour, or NULL
 *
 * THE MOMENT. `hour = H` means registration closes AT H:00 Israel wall-clock on the lock
 * date. `hour = NULL` means the pre-022 behaviour, unchanged: open through the END of the
 * lock date, i.e. closing at 00:00 the next day. NULL is hour 24, which is why adding the
 * hour needed no backfill — every existing lock kept the moment it already had.
 *
 * THE BOUNDARY IS INCLUSIVE OF THE INSTANT: `now >= moment` is locked. A deadline of
 * "17:00" means you had until 17:00, not through 17:59. Read the other way it would be
 * impossible to express "closes at noon" at all, and the NULL case would stop degrading
 * to the old `today > lockDate` rule.
 *
 * TIMEZONE. Everything is Asia/Jerusalem wall-clock, because that is what the units using
 * the deadline read off a wall. The hour is stored bare, with no offset, and the offset in
 * force ON THAT DATE is resolved here at read time — that is the only arrangement where a
 * deadline entered in March is still 17:00 local after the October DST switch. Storing a
 * fixed offset would silently drift by an hour across the boundary.
 *
 * WHY NOT JUST COMPARE STRINGS ANY MORE. The pre-022 check was `today > lockDate` on ISO
 * text, which is genuinely elegant: ISO dates sort lexicographically, so string comparison
 * IS date comparison, with no parsing and no timezone. That still holds for the date, but
 * two things now need a real instant: the countdown has to subtract two moments to get
 * "days and hours remaining", and the hour comparison has to survive the DST fold. So the
 * lock resolves to an epoch instant once, here, and every caller compares instants.
 */

/** Israel Standard/Daylight Time. */
export const APP_TIME_ZONE = "Asia/Jerusalem";

/** The lock as it comes off a certification row. Accepting the row shape rather than loose
 * arguments means a caller physically cannot pass the date and forget the hour — which
 * would silently reinstate the old end-of-day semantics. */
export interface RegistrationLockFields {
  registration_lock_date: string | null;
  registration_lock_hour?: number | null;
}

// en-CA formats as yyyy-MM-dd, which is exactly the storage format.
const isoDateInZone = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as 'yyyy-MM-dd' in the app's timezone. */
export function todayIsoDate(now: Date = new Date()): string {
  return isoDateInZone.format(now);
}

const wallClockInZone = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Asia/Jerusalem's UTC offset in milliseconds AT a given instant (+7_200_000 in winter,
 * +10_800_000 in summer). Derived from Intl rather than a hardcoded rule, so the DST
 * changeover dates come from the platform's tz database and stay right as they are
 * revised. */
function zoneOffsetMsAt(instant: Date): number {
  const parts = wallClockInZone.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    // Some ICU builds render midnight as hour 24 under hour12:false.
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return wallClockAsUtc - instant.getTime();
}

/**
 * An Asia/Jerusalem wall-clock reading → the real instant it names.
 *
 * Two passes, because the offset we need is the one in force at the ANSWER, not at the
 * guess: treat the wall clock as if it were UTC, subtract the offset at that rough
 * instant, then re-read the offset at the candidate and correct once more. That second
 * pass is what makes a deadline within a few hours of a DST switch land on the right side
 * of it.
 *
 * The two ambiguous hours a year resolve deterministically rather than throwing:
 *   - spring forward (02:00 does not exist): maps to 03:00, i.e. the deadline lands at the
 *     first real instant on or after the wall time it names — never earlier than intended.
 *   - fall back (01:00 happens twice): maps to the SECOND occurrence, the later instant,
 *     so nobody is locked out an hour before the wall clock says they should be.
 */
function zonedWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number
): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour);
  const firstPass = asIfUtc - zoneOffsetMsAt(new Date(asIfUtc));
  return new Date(asIfUtc - zoneOffsetMsAt(new Date(firstPass)));
}

/** Whole hours only, 0–23, or null. The single place a stray minute/float/string can be
 * turned away before it reaches storage or a comparison. */
export function normalizeLockHour(hour: unknown): number | null {
  if (hour === null || hour === undefined || hour === "") return null;
  const n = typeof hour === "string" ? Number(hour) : hour;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 23) return null;
  return n;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The instant registration closes, or null when there is no deadline.
 *
 * A malformed date returns null — "no deadline" — deliberately: the alternative is an
 * Invalid Date that compares false to everything, which reads as "open" anyway but does so
 * by accident instead of by decision.
 */
export function lockMoment(lock: RegistrationLockFields | null | undefined): Date | null {
  const date = lock?.registration_lock_date;
  if (!date || !ISO_DATE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const hour = normalizeLockHour(lock?.registration_lock_hour);
  // NULL hour = end of the lock day = 00:00 the next day. Passing hour 24 to
  // Date.UTC rolls the day over for us, including across month and year ends.
  return zonedWallClockToInstant(y, m, d, hour ?? 24);
}

/**
 * Whether registration is closed. No deadline means open — the absence of a deadline must
 * never read as a passed one.
 *
 * `now` is injectable so server callers stay explicit and the suite can test a boundary
 * without mocking the clock.
 */
export function isRegistrationLocked(
  lock: RegistrationLockFields | null | undefined,
  now: Date = new Date()
): boolean {
  const moment = lockMoment(lock);
  if (!moment) return false;
  return now.getTime() >= moment.getTime();
}

/** The Hebrew refusal shown wherever the lock blocks a write. One string, one wording. */
export const REGISTRATION_LOCKED_MESSAGE =
  "ההרשמה להסמכה זו נסגרה — חלף מועד נעילת ההרשמה.";

/** Formats a lock DATE for display, e.g. "24.08.2026". Returns null when there is none. */
export function formatLockDate(lockDate: string | null | undefined): string | null {
  if (!lockDate) return null;
  const [y, m, d] = lockDate.split("-");
  return `${d}.${m}.${y}`;
}

/** Formats an hour as "17:00". Whole hours only — there is no minute to render. */
export function formatLockHour(hour: number | null | undefined): string | null {
  const h = normalizeLockHour(hour);
  return h === null ? null : `${String(h).padStart(2, "0")}:00`;
}

/**
 * The full lock moment for display: "30.08.2026 17:00", or just "30.08.2026" when no hour
 * was set. The bare date is not padded out to "00:00" on purpose — that would read as
 * "closes at midnight AT THE START of the 30th", the opposite of what a NULL hour means.
 */
export function formatLockMoment(lock: RegistrationLockFields | null | undefined): string | null {
  const date = formatLockDate(lock?.registration_lock_date);
  if (!date) return null;
  const hour = formatLockHour(lock?.registration_lock_hour);
  return hour ? `${date} ${hour}` : date;
}

/** Every selectable closing hour, "00:00".."23:00". Whole hours only, by construction. */
export const LOCK_HOUR_OPTIONS: { value: number; label: string }[] = Array.from(
  { length: 24 },
  (_, h) => ({ value: h, label: `${String(h).padStart(2, "0")}:00` })
);

/** Default offered when an hour is being set for the first time. End of the working day —
 * and, more to the point, NOT 00:00, which a user would read as "the start of that day"
 * and which is the one value that changes an existing deadline's meaning the most. */
export const DEFAULT_LOCK_HOUR = 17;

export interface RemainingUntilLock {
  /** Whole days remaining. */
  days: number;
  /** Whole hours remaining after the days, 0–23. */
  hours: number;
  /** True once the moment has passed (both counts are 0 in that case). */
  passed: boolean;
}

/**
 * Time left until the lock, in DAYS AND WHOLE HOURS — never minutes, never seconds.
 *
 * ROUNDING: floor, at both levels. 3 days 5 hours 59 minutes shows as "3 days and 5
 * hours". The displayed figure is therefore always ≤ the real remaining time, so it can
 * never promise someone an hour they do not have. Rounding to nearest would read "6 hours"
 * with 5h31m left, and a unit that plans against that number arrives late.
 *
 * Returns null when there is no deadline, so callers branch on it rather than on a
 * sentinel zero.
 */
export function remainingUntilLock(
  lock: RegistrationLockFields | null | undefined,
  now: Date = new Date()
): RemainingUntilLock | null {
  const moment = lockMoment(lock);
  if (!moment) return null;
  const ms = moment.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, passed: true };
  const totalHours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24, passed: false };
}

/** Hebrew for a day count, using the dual for two ("יומיים"), as Hebrew actually does. */
function hebrewDays(n: number): string {
  if (n === 1) return "יום אחד";
  if (n === 2) return "יומיים";
  return `${n} ימים`;
}

/** Hebrew for an hour count, dual included ("שעתיים"). */
function hebrewHours(n: number): string {
  if (n === 1) return "שעה אחת";
  if (n === 2) return "שעתיים";
  return `${n} שעות`;
}

/** "ו-5 שעות" before a numeral, "ויומיים" before a word — the hyphen belongs only in
 * front of a digit. */
function conjoin(part: string): string {
  return /^\d/.test(part) ? `ו-${part}` : `ו${part}`;
}

/** The Hebrew closed state, kept next to the countdown wording it replaces. */
export const REGISTRATION_LOCKED_SHORT = "ההרשמה נעולה";

/**
 * "נותרו 3 ימים ו-5 שעות עד לנעילת ההרשמה" — the countdown sentence.
 *
 * The verb agrees with what follows it: singular for a lone "יום אחד" / "שעה אחת", plural
 * otherwise. Getting that wrong is not a rounding error, it just reads as broken Hebrew.
 *
 * Under an hour left is its own phrasing rather than "0 שעות", which flooring would
 * otherwise produce and which reads as "no time at all" when there is still some.
 */
export function formatRemainingUntilLock(remaining: RemainingUntilLock | null): string | null {
  if (!remaining) return null;
  if (remaining.passed) return REGISTRATION_LOCKED_SHORT;

  const { days, hours } = remaining;
  const suffix = "עד לנעילת ההרשמה";

  if (days === 0 && hours === 0) return `נותרה פחות משעה ${suffix}`;
  if (days === 0) {
    return `${hours === 1 ? "נותרה" : "נותרו"} ${hebrewHours(hours)} ${suffix}`;
  }
  if (hours === 0) {
    return `${days === 1 ? "נותר" : "נותרו"} ${hebrewDays(days)} ${suffix}`;
  }
  return `נותרו ${hebrewDays(days)} ${conjoin(hebrewHours(hours))} ${suffix}`;
}
