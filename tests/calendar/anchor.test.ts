import { describe, expect, it } from "vitest";
import { addDays, endOfMonth, endOfWeek, format, startOfMonth } from "date-fns";
import {
  appToday,
  appTodayIso,
  civilDate,
  isSameCalendarWeek,
  resolveAnchorIso,
  weekDaysOf,
  weekStartOf,
  WEEK_STARTS_ON,
} from "@/lib/calendar/anchor";

/**
 * The calendar anchor, driven by an INJECTED clock.
 *
 * Verifying against the real current date is what let this bug survive: today happens to
 * be the 1st of the month, so a month-anchored calendar and a week-anchored one render
 * identically. Every case below pins "now" explicitly.
 */

/** A UTC instant, so each fixture says exactly which moment it means. */
const at = (isoInstant: string) => new Date(isoInstant);
const d = (date: Date) => format(date, "yyyy-MM-dd");

describe("the week is Sunday-Saturday", () => {
  it("never relies on the date-fns default (Monday)", () => {
    expect(WEEK_STARTS_ON).toBe(0);
  });

  it("opens the week on Sunday for every day of a week", () => {
    for (let i = 0; i < 7; i++) {
      const day = addDays(new Date(2026, 5, 14), i);
      expect(d(weekStartOf(day))).toBe("2026-06-14");
      expect(weekStartOf(day).getDay()).toBe(0);
    }
  });

  it("returns seven days, Sunday first and Saturday last", () => {
    const days = weekDaysOf(new Date(2026, 5, 17));
    expect(days).toHaveLength(7);
    expect(d(days[0])).toBe("2026-06-14");
    expect(d(days[6])).toBe("2026-06-20");
  });
});

describe("civilDate - no UTC drift", () => {
  it("parses yyyy-MM-dd to LOCAL midnight, not UTC midnight", () => {
    const parsed = civilDate("2026-06-17")!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(17);
    expect(parsed.getHours()).toBe(0);
  });

  it("rejects malformed and impossible dates instead of yielding Invalid Date", () => {
    for (const bad of ["", "2026-6-7", "not-a-date", "2026-02-31", "2026-13-01"]) {
      expect(civilDate(bad)).toBeNull();
    }
    expect(civilDate(null)).toBeNull();
    expect(civilDate(undefined)).toBeNull();
  });
});

describe("today is Asia/Jerusalem's today, whatever the host timezone", () => {
  it("00:15 Israel time resolves to that day, not the UTC previous day", () => {
    // 2026-06-17T00:15 IDT === 2026-06-16T21:15Z. A UTC-based new Date() calls this the
    // 16th, which shifts the anchored week whenever the 16th is a Saturday.
    const now = at("2026-06-16T21:15:00Z");
    expect(appTodayIso(now)).toBe("2026-06-17");
    expect(now.toISOString().slice(0, 10)).toBe("2026-06-16");
  });

  it("23:45 Israel time is still the same day", () => {
    expect(appTodayIso(at("2026-06-17T20:45:00Z"))).toBe("2026-06-17");
  });

  it("resolves the winter (UTC+2) boundary too", () => {
    expect(appTodayIso(at("2026-01-14T22:30:00Z"))).toBe("2026-01-15");
  });

  it("crosses into a NEW week at the Israeli midnight boundary", () => {
    // Sat 2026-06-13 21:15Z is already Sun 2026-06-14 00:15 IDT - a new week.
    const now = at("2026-06-13T21:15:00Z");
    expect(appTodayIso(now)).toBe("2026-06-14");
    expect(d(weekStartOf(appToday(now)))).toBe("2026-06-14");
    // The naive UTC reading would have anchored a full week earlier.
    expect(d(weekStartOf(new Date(2026, 5, 13)))).toBe("2026-06-07");
  });
});

describe("the anchored week across boundaries - never clamped to the month", () => {
  it("1st of the month falling mid-week keeps the previous month's days", () => {
    // 2026-07-01 is a Wednesday; its week runs Sun 2026-06-28 .. Sat 2026-07-04.
    const today = civilDate("2026-07-01")!;
    expect(today.getDay()).toBe(3);
    const days = weekDaysOf(today);
    expect(d(days[0])).toBe("2026-06-28");
    expect(d(days[6])).toBe("2026-07-04");
    expect(new Set(days.map((x) => x.getMonth())).size).toBe(2);
  });

  it("a mid-month date anchors inside its own month", () => {
    const days = weekDaysOf(civilDate("2026-06-17")!);
    expect(d(days[0])).toBe("2026-06-14");
    expect(d(days[6])).toBe("2026-06-20");
  });

  it("the last day of the month keeps the week running into the next month", () => {
    // 2026-06-30 is a Tuesday; the week runs Sun 2026-06-28 .. Sat 2026-07-04.
    const days = weekDaysOf(civilDate("2026-06-30")!);
    expect(d(days[0])).toBe("2026-06-28");
    expect(d(days[6])).toBe("2026-07-04");
    expect(days.filter((x) => x.getMonth() === 6)).toHaveLength(4);
  });

  it("a week spanning the year boundary is not split", () => {
    // 2026-12-31 is a Thursday; the week runs Sun 2026-12-27 .. Sat 2027-01-02.
    const days = weekDaysOf(civilDate("2026-12-31")!);
    expect(d(days[0])).toBe("2026-12-27");
    expect(d(days[6])).toBe("2027-01-02");
    expect(new Set(days.map((x) => x.getFullYear()))).toEqual(new Set([2026, 2027]));
  });

  it("groups two dates in one week even across a year boundary", () => {
    // Comparing week NUMBERS would fail here: these are weeks 53 and 1.
    expect(isSameCalendarWeek(civilDate("2026-12-31")!, civilDate("2027-01-01")!)).toBe(true);
    expect(isSameCalendarWeek(civilDate("2027-01-02")!, civilDate("2027-01-03")!)).toBe(false);
  });
});

describe("the month grid always contains the anchored week", () => {
  // The property the bug violated: the grid rendered from the 1st with no relationship to
  // the week the user actually needed to see.
  const cases = ["2026-07-01", "2026-06-17", "2026-06-30", "2026-12-31", "2026-02-28"];

  it.each(cases)("the grid for %s includes every day of that week", (todayIso) => {
    const today = civilDate(todayIso)!;
    const gridStart = weekStartOf(startOfMonth(today));
    const gridEnd = endOfWeek(endOfMonth(today), { weekStartsOn: WEEK_STARTS_ON });
    for (const day of weekDaysOf(today)) {
      expect(day >= gridStart && day <= gridEnd).toBe(true);
    }
  });

  it.each(cases)("exactly one grid week is highlighted as current for %s", (todayIso) => {
    const today = civilDate(todayIso)!;
    const gridStart = weekStartOf(startOfMonth(today));
    const gridEnd = endOfWeek(endOfMonth(today), { weekStartsOn: WEEK_STARTS_ON });
    let matches = 0;
    for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
      if (isSameCalendarWeek(cursor, today)) matches++;
    }
    expect(matches).toBe(1);
  });
});

describe("fresh entry lands on the current week", () => {
  it("uses today when there is no URL param", () => {
    expect(resolveAnchorIso(null, "2026-06-17")).toBe("2026-06-17");
    expect(resolveAnchorIso(undefined, "2026-06-17")).toBe("2026-06-17");
  });

  it("lets an explicit ?date= win", () => {
    expect(resolveAnchorIso("2026-03-04", "2026-06-17")).toBe("2026-03-04");
  });

  it("falls back to today for a malformed param rather than breaking the view", () => {
    for (const bad of ["", "yesterday", "2026-02-31", "2026-6-7"]) {
      expect(resolveAnchorIso(bad, "2026-06-17")).toBe("2026-06-17");
    }
  });

  it("never anchors on the 1st of the month by default", () => {
    // Regression guard for the original bug, across a year of mid-month dates.
    for (let m = 0; m < 12; m++) {
      const today = new Date(2026, m, 17);
      const anchor = civilDate(resolveAnchorIso(null, d(today)))!;
      expect(anchor.getDate()).not.toBe(1);
      expect(isSameCalendarWeek(anchor, today)).toBe(true);
    }
  });
});
