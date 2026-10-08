/**
 * Maps the three database failures a brigade write can produce into Hebrew messages.
 *
 * Why by SQLSTATE and not by message text: the single-brigade trigger in
 * migrations/postgres/025_brigades.sql raises with a custom `ERRCODE = 'KS001'` precisely
 * so this layer can recognise it exactly, without string matching and without ever putting
 * `(err as Error).message` into a response. Raw Postgres text names tables, constraints and
 * trigger functions; none of that belongs in a client payload.
 *
 * An unrecognised error returns null and the caller answers a generic 500. That is
 * deliberate: a failure nobody predicted must not be narrated to the browser.
 */

export interface BrigadeWriteFailure {
  /** Hebrew, safe to render directly. */
  message: string;
  status: number;
}

/** Postgres SQLSTATEs this module knows about. */
const ISOLATION_NOT_READY = "KS001"; // custom, raised by trg_brigades_single_until_ready
const UNIQUE_VIOLATION = "23505"; // brigades_name_key
const CHECK_VIOLATION = "23514"; // brigades_name_not_blank

function sqlStateOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function brigadeWriteFailure(err: unknown): BrigadeWriteFailure | null {
  switch (sqlStateOf(err)) {
    case ISOLATION_NOT_READY:
      return {
        message:
          "לא ניתן ליצור חטיבה נוספת עד שיושלם בידוד הנתונים בין חטיבות. כל עוד הבידוד אינו פעיל, נתונים של שתי חטיבות יתערבבו זה בזה.",
        status: 409,
      };
    case UNIQUE_VIOLATION:
      return { message: "שם החטיבה כבר קיים במערכת", status: 409 };
    case CHECK_VIOLATION:
      return { message: "שם החטיבה אינו תקין", status: 400 };
    default:
      return null;
  }
}
