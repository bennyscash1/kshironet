import type { RequirementKeyLine, UnitCounts } from "@/lib/gaps/compute";

/**
 * The worked example from spec §3.1.3 — battalion 6228's 19 certifications.
 *
 * This is SPECIFICATION, not observed data. 6228 has no force-structure workbook, and
 * the held counts below are not reproducible from any file we hold, so this lives in a
 * fixture rather than in a seed: it is the arithmetic the tab must agree with, not a
 * description of the world.
 *
 * Note what is and is not stated. `required` is never written down — it is derived from
 * the key below, exactly as the app derives it, so the test proves the derivation rather
 * than a hard-coded total. `held` is given, because it is a fact about people.
 */

/** Unit counts for 6228 (§3.1.1). In the app these are counted from `roles`; 6228 has
 * none yet, so they arrive through the seeding-path fallback and are labelled as such. */
export const UNIT_COUNTS_6228: UnitCounts = {
  team: 3,
  team_niud: 1,
  team_heavy: 1,
  // Composite: team ∪ team_niud = 3 + 1. Never a stored row of its own, or the two would
  // be double-counted.
  team_all: 4,
  hq_battalion: 1,
  mefalag: 1,
  mihlol: 1,
  medic_team: 1,
  company: 4,
};

export const UNIT_NAMES: Record<string, string> = {
  team: "צוות",
  team_niud: "צוות ניוד",
  team_heavy: "צוות תקיפה כבדה",
  team_all: 'צוות כולל ניוד',
  hq_battalion: 'חפ"ק',
  mefalag: "מפלג",
  mihlol: "מכלול",
  medic_team: "חוליה רפואית",
  company: "פלוגה",
};

export type FixtureFamily = "drone" | "drive" | "arms" | "med" | "sys";

export interface FixtureRow {
  name: string;
  family: FixtureFamily;
  held: number;
  /** Which source the battalion has selected. */
  activeSource: "operational" | "establishment";
  /** The key for each source. A certification may define only the active one. */
  keys: {
    establishment?: RequirementKeyLine[];
    operational?: RequirementKeyLine[];
  };
  /** The value §5.0 expects `computeRequired` to produce for the ACTIVE source. */
  expectedRequired: number;
}

export const GAP_ROWS_6228: FixtureRow[] = [
  {
    name: "איבו",
    family: "drone",
    held: 14,
    activeSource: "operational",
    keys: {
      operational: [{ qty: 12, unitType: "team" }, { qty: 4, unitType: "hq_battalion" }],
      establishment: [{ qty: 4, unitType: "team" }, { qty: 4, unitType: "hq_battalion" }],
    },
    expectedRequired: 40,
  },
  {
    name: "אלפא",
    family: "drone",
    held: 7,
    activeSource: "operational",
    keys: { operational: [{ qty: 4, unitType: "team" }] },
    expectedRequired: 12,
  },
  {
    name: "בומרנג",
    family: "drone",
    held: 7,
    activeSource: "operational",
    keys: { operational: [{ qty: 4, unitType: "team" }] },
    expectedRequired: 12,
  },
  {
    name: "ציין אורין",
    family: "drone",
    held: 0,
    activeSource: "operational",
    keys: { operational: [{ qty: 4, unitType: "team" }] },
    expectedRequired: 12,
  },
  {
    // Surplus case: 7 held against 4 required.
    name: "פלייקארט",
    family: "drone",
    held: 7,
    activeSource: "operational",
    keys: { operational: [{ qty: 4, unitType: "team_heavy" }] },
    expectedRequired: 4,
  },
  {
    name: "עטלף",
    family: "drone",
    held: 7,
    activeSource: "operational",
    keys: { operational: [{ qty: 4, unitType: "team" }] },
    expectedRequired: 12,
  },
  {
    // Second surplus case, and a locked source.
    name: "אווטה",
    family: "drone",
    held: 8,
    activeSource: "establishment",
    keys: { establishment: [{ qty: 2, unitType: "team" }] },
    expectedRequired: 6,
  },
  {
    name: "חמשוש",
    family: "drone",
    held: 0,
    activeSource: "establishment",
    keys: { establishment: [{ qty: 2, unitType: "team" }] },
    expectedRequired: 6,
  },
  {
    name: "נהיגה מבצעית",
    family: "drive",
    held: 4,
    activeSource: "operational",
    keys: {
      operational: [{ qty: 3, unitType: "team" }],
      establishment: [{ qty: 6, unitType: "team_niud" }],
    },
    expectedRequired: 9,
  },
  {
    name: "האמר מנהלה",
    family: "drive",
    held: 24,
    activeSource: "operational",
    keys: {
      operational: [
        { qty: 4, unitType: "team_all" },
        { qty: 6, unitType: "hq_battalion" },
        { qty: 7, unitType: "mefalag" },
      ],
    },
    expectedRequired: 29,
  },
  {
    name: "אושקוש / FMTV",
    family: "drive",
    held: 0,
    activeSource: "operational",
    keys: { operational: [{ qty: 2, unitType: "team_niud" }] },
    expectedRequired: 2,
  },
  {
    name: "נגב 7",
    family: "arms",
    held: 0,
    activeSource: "establishment",
    keys: {
      establishment: [{ qty: 2, unitType: "team" }, { qty: 1, unitType: "team_niud" }],
    },
    expectedRequired: 7,
  },
  {
    name: "מטול צד",
    family: "arms",
    held: 0,
    activeSource: "establishment",
    keys: { establishment: [{ qty: 2, unitType: "team_all" }] },
    expectedRequired: 8,
  },
  {
    name: "פגיון",
    family: "arms",
    held: 2,
    activeSource: "establishment",
    keys: {
      establishment: [{ qty: 1, unitType: "team_all" }, { qty: 2, unitType: "hq_battalion" }],
    },
    expectedRequired: 6,
  },
  {
    name: "תרמיס",
    family: "arms",
    held: 2,
    activeSource: "establishment",
    keys: {
      establishment: [{ qty: 1, unitType: "team_all" }, { qty: 2, unitType: "hq_battalion" }],
    },
    expectedRequired: 6,
  },
  {
    name: "חובש",
    family: "med",
    held: 6,
    activeSource: "operational",
    keys: {
      operational: [
        { qty: 2, unitType: "team" },
        { qty: 1, unitType: "team_niud" },
        { qty: 2, unitType: "medic_team" },
      ],
    },
    expectedRequired: 9,
  },
  {
    name: 'מט"ב',
    family: "med",
    held: 0,
    activeSource: "establishment",
    keys: { establishment: [{ qty: 1, unitType: "medic_team" }] },
    expectedRequired: 1,
  },
  {
    name: "ציד 750",
    family: "sys",
    held: 2,
    activeSource: "establishment",
    keys: {
      establishment: [
        { qty: 1, unitType: "team_all" },
        { qty: 4, unitType: "hq_battalion" },
        { qty: 6, unitType: "mihlol" },
      ],
    },
    expectedRequired: 14,
  },
  {
    name: "מנהל מערכת 750",
    family: "sys",
    held: 0,
    activeSource: "establishment",
    keys: { establishment: [{ qty: 6, unitType: "mihlol" }] },
    expectedRequired: 6,
  },
];

/**
 * §5.0's expected requirement values, in the row order of the §3.1.3 table.
 *
 * The requirements document lists this vector as `… 2, 8, 7, 6 …` while its own data
 * table puts נגב 7 (=7) before מטול צד (=8). The two orderings contain the same values
 * and both total 201, so it is a transposition in the prose rather than a disagreement
 * about any certification. The tests therefore assert per certification BY NAME and on
 * the sorted multiset, which is insensitive to the ordering either way.
 */
export const EXPECTED_REQUIRED_VECTOR = [
  40, 12, 12, 12, 4, 12, 6, 6, 9, 29, 2, 7, 8, 6, 6, 9, 1, 14, 6,
];

/** §5.5's expected totals. 116 is the whole point: the naive
 * `SUM(required) − SUM(held)` gives 111. */
export const EXPECTED_TOTALS = { required: 201, held: 90, gap: 116, surplus: 5 };

/** §5.5's expected cumulative gap per family. */
export const EXPECTED_FAMILY_GAPS: Record<FixtureFamily, number> = {
  drone: 59,
  arms: 23,
  sys: 18,
  drive: 12,
  med: 4,
};

/** The active key for a fixture row. */
export function activeKeyOf(row: FixtureRow): RequirementKeyLine[] {
  return row.keys[row.activeSource] ?? [];
}
