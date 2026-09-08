import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCK_HOUR,
  LOCK_HOUR_OPTIONS,
  REGISTRATION_LOCKED_MESSAGE,
  REGISTRATION_LOCKED_SHORT,
  formatLockDate,
  formatLockHour,
  formatLockMoment,
  formatRemainingUntilLock,
  isRegistrationLocked,
  lockMoment,
  normalizeLockHour,
  remainingUntilLock,
  todayIsoDate,
} from "@/lib/utils/registration-lock";
import { certificationPatchSchema } from "@/lib/validation/certification";

/**
 * The single registration deadline on a certification: a DATE (migration 021) and an HOUR
 * (migration 022), resolved to one Israel-local moment.
 *
 * The boundary is the whole point of this suite. Off-by-one here does not look like a bug —
 * it looks like the deadline working, one day or one hour early, for everybody.
 */

/** A lock as it comes off a certification row. */
const at = (date: string | null, hour: number | null = null) => ({
  registration_lock_date: date,
  registration_lock_hour: hour,
});
const utc = (iso: string) => new Date(iso);

describe("lockMoment — the wall clock resolved to a real instant", () => {
  it("puts an hour at that hour, Israel local", () => {
    // 30.08 is summer time (IDT, UTC+3), so 17:00 local is 14:00Z.
    expect(lockMoment(at("2026-08-30", 17))?.toISOString()).toBe("2026-08-30T14:00:00.000Z");
  });

  it("uses the offset in force ON THE LOCK DATE, not a fixed one", () => {
    // The same 17:00 in winter (IST, UTC+2) is 15:00Z. A deadline stored with a baked-in
    // offset would drift by an hour across the DST boundary; the hour is stored bare and
    // the offset resolved here precisely so it does not.
    expect(lockMoment(at("2026-01-15", 17))?.toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });

  it("treats a NULL hour as the end of the lock day — hour 24", () => {
    // This equivalence is what let migration 022 skip a backfill: every pre-existing
    // date-only lock keeps the exact moment it already had.
    expect(lockMoment(at("2026-08-14"))?.toISOString()).toBe("2026-08-14T21:00:00.000Z");
  });

  it("rolls a NULL hour over month and year ends", () => {
    expect(lockMoment(at("2026-08-31"))?.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    // Winter, so UTC+2 — and the year rolls too.
    expect(lockMoment(at("2026-12-31"))?.toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });

  it("returns null for no deadline and for a malformed one", () => {
    expect(lockMoment(at(null))).toBeNull();
    expect(lockMoment(at(""))).toBeNull();
    expect(lockMoment(null)).toBeNull();
    // Deciding "no deadline" beats producing an Invalid Date that compares false to
    // everything and reads as open by accident.
    expect(lockMoment(at("2026-08-30T17:00:00+03:00", 17))).toBeNull();
    expect(lockMoment(at("30/08/2026"))).toBeNull();
  });

  it("resolves the two ambiguous hours a year deterministically", () => {
    // Spring forward: 02:00 on 27.03.2026 does not exist. It maps to the first real instant
    // at or after it (03:00 IDT) — never earlier than what was typed.
    expect(lockMoment(at("2026-03-27", 2))?.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    // Fall back: 01:00 on 25.10.2026 happens twice. It maps to the SECOND, later occurrence
    // (01:00 IST = 23:00Z), so nobody is locked out an hour before the wall clock says.
    expect(lockMoment(at("2026-10-25", 1))?.toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });
});

describe("isRegistrationLocked — the boundary", () => {
  it("closes AT the hour, not after it", () => {
    const lock = at("2026-08-30", 17); // 14:00Z
    expect(isRegistrationLocked(lock, utc("2026-08-30T13:59:59Z"))).toBe(false);
    // A deadline of "17:00" means you had until 17:00, not through 17:59.
    expect(isRegistrationLocked(lock, utc("2026-08-30T14:00:00Z"))).toBe(true);
    expect(isRegistrationLocked(lock, utc("2026-08-30T14:00:01Z"))).toBe(true);
  });

  it("rejects an attempt made after the closing hour but still on the lock date", () => {
    // The regression migration 022 has to avoid: the date-only rule kept this open for
    // another seven hours, right through the evening of the closing day.
    expect(isRegistrationLocked(at("2026-08-30", 17), utc("2026-08-30T18:00:00Z"))).toBe(true);
  });

  it("keeps the pre-022 end-of-day rule when no hour is set", () => {
    const lock = at("2026-08-14");
    // 20:00Z = 23:00 Israel on the 14th — the 14th is still yours.
    expect(isRegistrationLocked(lock, utc("2026-08-14T20:00:00Z"))).toBe(false);
    // 21:30Z = 00:30 Israel on the 15th — closed.
    expect(isRegistrationLocked(lock, utc("2026-08-14T21:30:00Z"))).toBe(true);
  });

  it("treats no deadline as open, never as passed", () => {
    // A certification that was never given a deadline must not read as closed — that would
    // silently block registration on every certification with a NULL column.
    expect(isRegistrationLocked(at(null), utc("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isRegistrationLocked(at(""), utc("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isRegistrationLocked(null, utc("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isRegistrationLocked(undefined, utc("2030-01-01T00:00:00Z"))).toBe(false);
  });

  it("ignores an hour it cannot use rather than shifting the deadline", () => {
    // A fractional or out-of-range hour degrades to the end-of-day moment. Truncating it to
    // 17 would move the deadline to a time nobody chose.
    expect(lockMoment(at("2026-08-14", 17.5))?.toISOString()).toBe("2026-08-14T21:00:00.000Z");
    expect(lockMoment(at("2026-08-14", 24))?.toISOString()).toBe("2026-08-14T21:00:00.000Z");
  });

  it("crosses midnight, month and year on the resolved instant", () => {
    expect(isRegistrationLocked(at("2026-08-31"), utc("2026-09-01T00:00:00Z"))).toBe(true);
    expect(isRegistrationLocked(at("2026-12-31"), utc("2026-12-31T21:00:00Z"))).toBe(false);
    expect(isRegistrationLocked(at("2026-12-31"), utc("2026-12-31T22:30:00Z"))).toBe(true);
  });
});

describe("todayIsoDate — the app's timezone, not the server's", () => {
  it("formats as yyyy-MM-dd", () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports the Israeli calendar day, not the UTC one", () => {
    // 22:30 UTC on the 14th is already 01:30 on the 15th in Israel.
    expect(todayIsoDate(utc("2026-08-14T22:30:00Z"))).toBe("2026-08-15");
    expect(todayIsoDate(utc("2026-08-14T06:00:00Z"))).toBe("2026-08-14");
  });
});

describe("normalizeLockHour — whole hours only", () => {
  it("accepts the 24 whole hours, including 0", () => {
    expect(normalizeLockHour(0)).toBe(0);
    expect(normalizeLockHour(17)).toBe(17);
    expect(normalizeLockHour(23)).toBe(23);
    expect(normalizeLockHour("17")).toBe(17);
  });

  it("turns away anything that is not one", () => {
    expect(normalizeLockHour(17.5)).toBeNull();
    expect(normalizeLockHour(-1)).toBeNull();
    expect(normalizeLockHour(24)).toBeNull();
    // A stray "17:30" from a time input must not become 17.
    expect(normalizeLockHour("17:30")).toBeNull();
    expect(normalizeLockHour("abc")).toBeNull();
  });

  it("maps the empty states to null, which means end-of-day", () => {
    expect(normalizeLockHour(null)).toBeNull();
    expect(normalizeLockHour(undefined)).toBeNull();
    expect(normalizeLockHour("")).toBeNull();
  });
});

describe("remainingUntilLock — days and whole hours, floored", () => {
  const lock = at("2026-08-30", 17); // 14:00Z

  it("counts days and hours", () => {
    expect(remainingUntilLock(lock, utc("2026-08-27T09:00:00Z"))).toEqual({
      days: 3,
      hours: 5,
      passed: false,
    });
  });

  it("floors rather than rounds, so it never overstates the time left", () => {
    // 3 days 4 hours 59 minutes. Rounding would say 5 hours, and a unit planning against
    // that number arrives after the deadline.
    expect(remainingUntilLock(lock, utc("2026-08-27T09:01:00Z"))).toEqual({
      days: 3,
      hours: 4,
      passed: false,
    });
  });

  it("counts REAL elapsed hours across a DST change, not wall-clock ones", () => {
    // 24.10 is IDT (+3), 26.10 is IST (+2) — the clocks go back in between. The wall clock
    // says 10:00 to 10:00 is 48 hours; it is actually 49, and the countdown must say so.
    const acrossDst = at("2026-10-26", 10);
    expect(remainingUntilLock(acrossDst, utc("2026-10-24T07:00:00Z"))).toEqual({
      days: 2,
      hours: 1,
      passed: false,
    });
  });

  it("reports passed once the moment arrives, never a negative count", () => {
    expect(remainingUntilLock(lock, utc("2026-08-30T14:00:00Z"))).toEqual({
      days: 0,
      hours: 0,
      passed: true,
    });
    expect(remainingUntilLock(lock, utc("2027-01-01T00:00:00Z"))).toEqual({
      days: 0,
      hours: 0,
      passed: true,
    });
  });

  it("returns null with no deadline, so callers branch instead of reading a zero", () => {
    expect(remainingUntilLock(at(null), utc("2026-08-27T09:00:00Z"))).toBeNull();
  });
});

describe("formatRemainingUntilLock — Hebrew that reads correctly", () => {
  const say = (days: number, hours: number) =>
    formatRemainingUntilLock({ days, hours, passed: false });

  it("uses plural for the common case", () => {
    expect(say(3, 5)).toBe("נותרו 3 ימים ו-5 שעות עד לנעילת ההרשמה");
  });

  it("uses the Hebrew dual for two", () => {
    expect(say(2, 0)).toBe("נותרו יומיים עד לנעילת ההרשמה");
    expect(say(0, 2)).toBe("נותרו שעתיים עד לנעילת ההרשמה");
    // "ו" joins a word directly; the hyphen belongs only in front of a digit.
    expect(say(3, 2)).toBe("נותרו 3 ימים ושעתיים עד לנעילת ההרשמה");
  });

  it("agrees the verb with a lone singular", () => {
    expect(say(1, 0)).toBe("נותר יום אחד עד לנעילת ההרשמה");
    expect(say(0, 1)).toBe("נותרה שעה אחת עד לנעילת ההרשמה");
  });

  it("says less-than-an-hour instead of the zero that flooring produces", () => {
    // "נותרו 0 שעות" reads as no time at all when there is still some.
    expect(say(0, 0)).toBe("נותרה פחות משעה עד לנעילת ההרשמה");
  });

  it("shows a closed state, never a negative countdown", () => {
    expect(formatRemainingUntilLock({ days: 0, hours: 0, passed: true })).toBe(
      REGISTRATION_LOCKED_SHORT
    );
    expect(REGISTRATION_LOCKED_SHORT).toBe("ההרשמה נעולה");
  });

  it("returns null with no deadline", () => {
    expect(formatRemainingUntilLock(null)).toBeNull();
  });

  it("never mentions minutes or seconds", () => {
    for (const text of [say(3, 5), say(0, 1), say(2, 0), say(0, 0)]) {
      expect(text).not.toMatch(/דק|שני|:/);
    }
  });
});

describe("display helpers", () => {
  it("formats a lock date for Hebrew UI", () => {
    expect(formatLockDate("2026-08-14")).toBe("14.08.2026");
    expect(formatLockDate(null)).toBeNull();
    expect(formatLockDate("")).toBeNull();
  });

  it("formats an hour as a whole hour", () => {
    expect(formatLockHour(9)).toBe("09:00");
    expect(formatLockHour(0)).toBe("00:00");
    expect(formatLockHour(null)).toBeNull();
  });

  it("shows the full moment when an hour is set", () => {
    expect(formatLockMoment(at("2026-08-30", 17))).toBe("30.08.2026 17:00");
  });

  it("leaves a date-only lock bare rather than padding it to 00:00", () => {
    // "30.08.2026 00:00" would read as the START of the 30th — the opposite of what a NULL
    // hour means, which is the end of it.
    expect(formatLockMoment(at("2026-08-30"))).toBe("30.08.2026");
    expect(formatLockMoment(at(null))).toBeNull();
  });

  it("offers exactly the 24 whole hours", () => {
    expect(LOCK_HOUR_OPTIONS).toHaveLength(24);
    expect(LOCK_HOUR_OPTIONS[0]).toEqual({ value: 0, label: "00:00" });
    expect(LOCK_HOUR_OPTIONS[23]).toEqual({ value: 23, label: "23:00" });
    // Every label is a whole hour — no option can express a minute.
    for (const o of LOCK_HOUR_OPTIONS) expect(o.label).toMatch(/^\d{2}:00$/);
    expect(LOCK_HOUR_OPTIONS.some((o) => o.value === DEFAULT_LOCK_HOUR)).toBe(true);
  });

  it("names the deadline, not a per-battalion allocation", () => {
    expect(REGISTRATION_LOCKED_MESSAGE).toContain("ההרשמה להסמכה זו נסגרה");
    expect(REGISTRATION_LOCKED_MESSAGE).not.toContain("גדוד");
  });
});

describe("certificationPatchSchema — the hour at the API boundary", () => {
  const parse = (body: unknown) => certificationPatchSchema.safeParse(body);

  it("accepts a whole hour with a date", () => {
    const r = parse({ registration_lock_date: "2026-08-30", registration_lock_hour: 17 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.registration_lock_hour).toBe(17);
  });

  it("accepts 0 as a real hour, not as an empty value", () => {
    const r = parse({ registration_lock_date: "2026-08-30", registration_lock_hour: 0 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.registration_lock_hour).toBe(0);
  });

  it("accepts clearing the whole lock", () => {
    const r = parse({ registration_lock_date: null, registration_lock_hour: null });
    expect(r.success).toBe(true);
  });

  it("rejects anything finer than a whole hour", () => {
    expect(parse({ registration_lock_date: "2026-08-30", registration_lock_hour: 17.5 }).success)
      .toBe(false);
    // A "17:30" must be refused, not silently truncated to 17.
    expect(parse({ registration_lock_date: "2026-08-30", registration_lock_hour: "17:30" }).success)
      .toBe(false);
  });

  it("rejects an hour outside 0–23", () => {
    expect(parse({ registration_lock_date: "2026-08-30", registration_lock_hour: -1 }).success)
      .toBe(false);
    expect(parse({ registration_lock_date: "2026-08-30", registration_lock_hour: 24 }).success)
      .toBe(false);
  });

  it("rejects an hour with no date to hang it on", () => {
    // Nothing would enforce it and nothing would show it — a 400 beats a deadline that
    // quietly disappeared.
    const r = parse({ registration_lock_date: null, registration_lock_hour: 17 });
    expect(r.success).toBe(false);
  });

  it("still allows a date-only patch, which means end of that day", () => {
    const r = parse({ registration_lock_date: "2026-08-30" });
    expect(r.success).toBe(true);
  });
});
