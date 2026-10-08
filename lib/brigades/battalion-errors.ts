/**
 * Maps the database failures a battalion write can produce into Hebrew messages.
 *
 * Same rationale as lib/brigades/errors.ts: mapped by SQLSTATE, never by message text, and
 * `(err as Error).message` is never put into a response — raw Postgres text names tables,
 * constraints and columns. An unrecognised error returns null and the caller answers a
 * generic 500, so a failure nobody predicted is not narrated to the browser.
 */

import { BATTALION_CODE_UNAVAILABLE } from "@/lib/validation/battalion";

export interface BattalionWriteFailure {
  /** Hebrew, safe to render directly. */
  message: string;
  status: number;
  /**
   * When set, the caller answers with the Zod-flatten shape so the client renders this
   * against the named field instead of as a banner — a duplicate code is a validation
   * failure on `code`, and should look like every other one.
   */
  field?: "code";
}

const UNIQUE_VIOLATION = "23505";

/** Per-brigade uniqueness, from migration 026. */
const BRIGADE_CODE_CONSTRAINT = "battalions_brigade_code_key";
/** Army-wide uniqueness among ACTIVE battalions, from migration 029. */
const ACTIVE_CODE_CONSTRAINT = "battalions_active_code_unique";
const FK_VIOLATION = "23503"; // battalions_brigade_fk — brigade_id does not exist
const CHECK_VIOLATION = "23514";
const NOT_NULL_VIOLATION = "23502";

function fieldOf(err: unknown, key: "code" | "constraint"): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const value = (err as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

const sqlStateOf = (err: unknown) => fieldOf(err, "code");

export function battalionWriteFailure(err: unknown): BattalionWriteFailure | null {
  switch (sqlStateOf(err)) {
    case UNIQUE_VIOLATION:
      /**
       * Two different unique constraints can raise 23505 here, and they mean different
       * things, so they are told apart by constraint NAME rather than lumped together.
       * node-pg exposes it as `err.constraint`.
       *
       * An unrecognised 23505 deliberately falls through to `null` — this must not swallow
       * a unique violation it does not understand and label it a duplicate code.
       */
      switch (fieldOf(err, "constraint")) {
        case ACTIVE_CODE_CONSTRAINT:
          // Army-wide: the number is held by an ACTIVE battalion somewhere. The message
          // says only that it is unavailable — never where, never by whom. See
          // BATTALION_CODE_UNAVAILABLE for why.
          return {
            message: BATTALION_CODE_UNAVAILABLE,
            status: 400,
            field: "code",
          };
        case BRIGADE_CODE_CONSTRAINT:
          // Within the caller's own brigade, which they can already see, so naming it
          // reveals nothing they do not have.
          return { message: "קוד גדוד זה כבר קיים בחטיבה", status: 409 };
        default:
          return null;
      }
    case FK_VIOLATION:
      return { message: "החטיבה שנבחרה אינה קיימת", status: 400 };
    case NOT_NULL_VIOLATION:
      return { message: "חסרים פרטים ליצירת הגדוד", status: 400 };
    case CHECK_VIOLATION:
      return { message: "אחד מהשדות אינו תקין", status: 400 };
    default:
      return null;
  }
}
