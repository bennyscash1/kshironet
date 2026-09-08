import { describe, expect, it } from "vitest";
import {
  MAX_EXPORT_SPAN_DAYS,
  battalionIdParamSchema,
  weeklyExportQuerySchema,
} from "@/lib/validation/battalion-export";
import { buildWeeklyCertificationsPdf } from "@/lib/pdf/weekly-certifications";

/**
 * The weekly PDF export: the range the route will accept, and that the generator produces
 * a real PDF for the rows the fixed query now returns — a quota with no names included.
 */

describe("weeklyExportQuerySchema", () => {
  const ok = (from: string, to: string) => weeklyExportQuerySchema.safeParse({ from, to }).success;

  it("accepts a normal week", () => {
    expect(ok("2026-08-23", "2026-08-29")).toBe(true);
  });

  it("accepts a single day", () => {
    expect(ok("2026-08-23", "2026-08-23")).toBe(true);
  });

  it("rejects a reversed range", () => {
    expect(ok("2026-08-29", "2026-08-23")).toBe(false);
  });

  it("rejects a range longer than the cap", () => {
    // The button only ever sends 7 days; the cap stops a hand-crafted query string from
    // asking the server to render a several-hundred-page PDF.
    expect(ok("2026-01-01", "2026-12-31")).toBe(false);
    expect(MAX_EXPORT_SPAN_DAYS).toBe(31);
  });

  it("accepts exactly the cap and rejects one day past it", () => {
    expect(ok("2026-03-01", "2026-03-31")).toBe(true); // 31 days inclusive
    expect(ok("2026-03-01", "2026-04-01")).toBe(false); // 32
  });

  it("rejects anything that is not an ISO date", () => {
    expect(ok("23.08.2026", "29.08.2026")).toBe(false);
    expect(ok("2026-8-23", "2026-08-29")).toBe(false);
    expect(weeklyExportQuerySchema.safeParse({ from: null, to: null }).success).toBe(false);
    expect(weeklyExportQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("battalionIdParamSchema", () => {
  it("coerces the path string to a positive integer", () => {
    expect(battalionIdParamSchema.parse("4")).toBe(4);
  });

  it("rejects junk and non-positive ids", () => {
    for (const bad of ["abc", "0", "-1", "1.5", ""]) {
      expect(battalionIdParamSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("buildWeeklyCertificationsPdf", () => {
  const base = {
    battalionCode: "6228",
    battalionName: "גדוד 6228",
    from: "2026-08-23",
    to: "2026-08-29",
    generatedAt: "26.08.2026 12:30",
  };
  const isPdf = (b: Uint8Array) => Buffer.from(b.subarray(0, 5)).toString() === "%PDF-";

  it("produces a PDF for a week that includes a quota with no names", () => {
    const pdf = buildWeeklyCertificationsPdf({
      ...base,
      rows: [
        {
          name: "נהיגה מבצעית",
          location: "בה״ד 6",
          start_date: "2026-08-24",
          end_date: "2026-08-27",
          status: "open",
          allocated_slots: 5,
          registered: 0,
          has_quota: true,
          opportunity: "battalion_quota" as const,
        },
        {
          name: "החייאה",
          location: null,
          start_date: "2026-08-26",
          end_date: null,
          status: "completed",
          allocated_slots: null,
          registered: 2,
          has_quota: false,
          // An ended cycle is no longer an opportunity, so it prints untinted — the same
          // rule the band and the calendar apply.
          opportunity: null,
        },
      ],
    });
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(10_000); // the embedded font alone is ~44KB
  });

  it("still produces a valid PDF for an empty week", () => {
    const pdf = buildWeeklyCertificationsPdf({ ...base, rows: [] });
    expect(isPdf(pdf)).toBe(true);
  });

  it("paginates rather than overflowing a long week", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `הסמכה ארוכה במיוחד עם שם שנמשך על פני כמה שורות ${i}`,
      location: "מיקום כלשהו עם שם ארוך",
      start_date: "2026-08-24",
      end_date: "2026-08-27",
      status: "open" as const,
      allocated_slots: 5,
      registered: 0,
      has_quota: true,
      opportunity: "battalion_quota" as const,
    }));
    const pdf = buildWeeklyCertificationsPdf({ ...base, rows: many });
    expect(isPdf(pdf)).toBe(true);
    // More than one page object means the page-break path actually ran.
    expect(Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0)
      .toBeGreaterThan(1);
  });
});
