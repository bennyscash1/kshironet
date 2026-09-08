import { format } from "date-fns";
import { getWeekNumber, getHebrewDayRangeLabel, getHebrewWeekdayShort } from "@/lib/utils/dates";
import type { Battalion, Training, TrainingSession } from "@/lib/types";
import { battalionLabel } from "@/lib/battalions/label";

/** DOM id of the off-screen container captured by the training PDF export. */
export const TRAINING_PRINT_ROOT_ID = "training-detail-print-root";

/** dd/MM/yyyy without timezone math (matches components/ui/date-range.tsx). */
function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const [year, month, day] = d.split("-");
  if (!year || !month || !day) return d;
  return `${day}/${month}/${year}`;
}

function dateRangeLabel(start: string, end: string | null): string {
  const s = formatDate(start);
  return end && end !== start ? `${s} – ${formatDate(end)}` : s;
}

/** Static, print-only mirror of <SessionCard> (no edit/delete controls). Renders the
 * same fields as the on-screen card, including the free-text `notes` block that carries
 * the מיקום/מוצב, כמות מתאמני, סמל מ"פ etc. lines. */
function PrintSessionCard({
  session,
  battalion,
}: {
  session: TrainingSession;
  battalion?: Battalion;
}) {
  const color = battalion?.color_hex ?? "#64748B";
  return (
    <div
      data-pdf-atomic
      className="rounded-lg p-3 shadow-sm"
      style={{ backgroundColor: color, color: "#ffffff", breakInside: "avoid" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          dir="ltr"
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: "rgba(255,255,255,0.22)" }}
        >
          {session.start_time}–{session.end_time}
        </span>
      </div>
      <div className="font-semibold text-sm mt-1">
        {/* The battalion's own name, not "גדוד" + its code: the code is a Latin slug for
            the non-numeric units, which rendered "גדוד gdsm" here. */}
        {battalionLabel(battalion, "?")}
        {session.instructor_name ? ` · ${session.instructor_name}` : ""}
      </div>
      {session.location && <div className="text-sm mt-1">{session.location}</div>}
      {session.instructor_phone && (
        <div className="text-sm mt-0.5" dir="ltr">
          {session.instructor_phone}
        </div>
      )}
      {session.notes && (
        <div className="text-sm mt-1 whitespace-pre-wrap" style={{ opacity: 0.95 }}>
          {session.notes}
        </div>
      )}
    </div>
  );
}

function groupByDay(sessions: TrainingSession[]): [string, TrainingSession[]][] {
  const byDay = new Map<string, TrainingSession[]>();
  for (const s of sessions) {
    const list = byDay.get(s.session_date) ?? [];
    list.push(s);
    byDay.set(s.session_date, list);
  }
  return [...byDay.entries()];
}

/**
 * Off-screen printable version of the training detail page (route /trainings/[id]).
 * Reproduces every on-screen section — title header, איש קשר, הערות, and the day-grouped
 * unit session cards — minus interactive controls. Positioned far off-screen (not
 * display:none) so it still has layout for html2canvas to capture.
 */
export function TrainingDetailPrint({
  training,
  sessions,
  battalionsById,
  exportDateLabel,
}: {
  training: Training;
  sessions: TrainingSession[];
  battalionsById: Map<number, Battalion>;
  exportDateLabel: string;
}) {
  const days = groupByDay(sessions);

  return (
    <div
      id={TRAINING_PRINT_ROOT_ID}
      dir="rtl"
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        insetInlineStart: "-10000px",
        width: "780px",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Title header */}
      <div data-pdf-atomic style={{ paddingBottom: "10px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700 }}>{training.name}</h1>
        <div style={{ fontSize: "14px", color: "#475569", marginTop: "2px" }}>
          {training.domain ?? "ללא תחום"}
        </div>
        <div style={{ fontSize: "13px", marginTop: "4px" }}>
          <span dir="ltr">{dateRangeLabel(training.start_date, training.end_date)}</span>
          <span style={{ color: "#64748b" }}>
            {"  ·  "}שבוע {getWeekNumber(training.start_date)} ·{" "}
            {getHebrewDayRangeLabel(training.start_date, training.end_date)}
          </span>
        </div>
        <div
          suppressHydrationWarning
          style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}
        >
          הופק בתאריך {exportDateLabel}
        </div>
      </div>

      {/* איש קשר */}
      <div
        data-pdf-atomic
        style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", marginTop: "12px" }}
      >
        <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>איש קשר</div>
        {training.contact_name || training.contact_phone ? (
          <div style={{ fontSize: "14px", marginTop: "4px" }}>
            {training.contact_name}
            {training.contact_phone ? (
              <span style={{ color: "#64748b" }} dir="ltr">
                {" "}
                {training.contact_phone}
              </span>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>אין איש קשר</div>
        )}
      </div>

      {/* הערות */}
      <div
        data-pdf-atomic
        style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", marginTop: "12px" }}
      >
        <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>הערות</div>
        <div style={{ fontSize: "14px", marginTop: "4px", whiteSpace: "pre-wrap" }}>
          {training.notes || <span style={{ color: "#94a3b8" }}>אין הערות</span>}
        </div>
      </div>

      {/* מעקב ביצוע ההדרכה ביחידות */}
      <div
        data-pdf-atomic
        data-pdf-group-start="true"
        style={{ fontSize: "17px", fontWeight: 600, marginTop: "18px", marginBottom: "8px" }}
      >
        מעקב ביצוע ההדרכה ביחידות
      </div>

      {sessions.length === 0 ? (
        <div data-pdf-atomic style={{ fontSize: "13px", color: "#94a3b8" }}>
          אין מקצי הדרכה ליחידות
        </div>
      ) : (
        days.map(([day, daySessions]) => (
          <div key={day} style={{ marginBottom: "10px" }}>
            <div
              data-pdf-atomic
              data-pdf-group-start="true"
              style={{ fontSize: "14px", fontWeight: 600, margin: "4px 0" }}
            >
              יום {getHebrewWeekdayShort(day)}, {format(new Date(day), "dd/MM/yyyy")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {daySessions.map((s) => (
                <PrintSessionCard
                  key={s.id}
                  session={s}
                  battalion={battalionsById.get(s.battalion_id)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
