/**
 * The unscoped-entity block: one place that knows which entities are blocked, what they
 * are called in Hebrew, and how to recognise the database's refusal.
 *
 * The refusal itself lives in a trigger (migrations/postgres/027_unscoped_entity_guard.sql)
 * so no code path can get around it, scripts included. This module only translates it.
 */

/** Raised by `unscoped_entity_write_is_blocked()`. */
export const UNSCOPED_ENTITY_BLOCKED = "KS002";

/**
 * Every table the guard protects, with its Hebrew name.
 *
 * The keys are exactly the tables carrying `trg_*_unscoped_guard` in migration 027. Keep
 * the two in step: a table added to the trigger list without an entry here would still be
 * refused by the database but would surface as the generic fallback message, and a test
 * asserts the two lists match.
 */
export const BLOCKED_ENTITIES = {
  certifications: "הסמכות",
  certification_templates: "תבניות הסמכה (בנק ההסמכות)",
  certification_gap_rows: "שורות פערים",
  trainings: "הדרכות",
  influencing_factors: "גורמים משפיעים",
  soldier_certifications: "הסמכות שבידי חיילים",
} as const;

export type BlockedEntity = keyof typeof BLOCKED_ENTITIES;

export interface UnscopedBlockFailure {
  /** Hebrew, safe to render directly. */
  message: string;
  status: number;
}

function fieldOf(err: unknown, key: "code" | "table"): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const value = (err as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Recognises the guard's refusal and names, in Hebrew, what was blocked and why.
 *
 * Matched on SQLSTATE plus the `TABLE` the trigger attaches via `RAISE ... USING TABLE`,
 * never on message text — and `(err as Error).message` is never returned, because the raw
 * text names the trigger function and the table.
 *
 * Returns null for anything else, so the caller falls through to its own handling.
 */
export function unscopedBlockFailure(err: unknown): UnscopedBlockFailure | null {
  if (fieldOf(err, "code") !== UNSCOPED_ENTITY_BLOCKED) return null;

  const table = fieldOf(err, "table");
  const label =
    table && table in BLOCKED_ENTITIES
      ? BLOCKED_ENTITIES[table as BlockedEntity]
      : "רשומות מסוג זה";

  return {
    message:
      `לא ניתן ליצור ${label} כרגע: הישות הזו עדיין אינה משויכת לחטיבה, ובמערכת קיימת יותר מחטיבה אחת פעילה. ` +
      `יצירה במצב זה הייתה מערבבת נתונים בין החטיבות בלי להודיע על כך. ` +
      `ניתן להמשיך לצפות ולערוך רשומות קיימות. ` +
      `היצירה תתאפשר לאחר שיושלם בידוד הנתונים בין חטיבות, או אם תושבת אחת החטיבות.`,
    status: 409,
  };
}
