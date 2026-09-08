import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CertificationStatusBadge } from "@/components/certifications/status-badge";
import { DateRange } from "@/components/ui/date-range";
import type { BattalionSummary as BattalionSummaryData } from "@/lib/db/repositories/battalion-summary";

/** One headline figure. */
function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${className ?? "bg-card"}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * A battalion's own summary: what it was allocated across the brigade's certifications,
 * how much of that is filled, and what it still lacks.
 *
 * The final contents are still being defined — each block below reads one independent
 * section of `BattalionSummary`, so a section can be reworked or added without disturbing
 * the rest. `certificationHref` decides where a row links: the battalion-scoped view for a
 * scoped user, the full certification page for a global one.
 */
export function BattalionSummary({
  summary,
  certificationHref,
}: {
  summary: BattalionSummaryData;
  certificationHref: (certificationId: number) => string;
}) {
  const { totals, certifications, gaps, requests } = summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="הסמכות" value={totals.certifications} hint="פעילות ומתוכננות" />
        <Stat label="הוקצו לגדוד" value={totals.allocated} hint="סה״כ מקומות" />
        <Stat label="שובצו" value={totals.registered} hint="חיילים בשמות" />
        <Stat
          label="מקומות פנויים"
          value={totals.remaining}
          hint="הקצאות ללא שמות"
          className={totals.remaining > 0 ? "bg-amber-50 border-amber-200" : "bg-card"}
        />
        <Stat label="עתודה" value={totals.reserve} hint="מחוץ להקצאה" />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">הקצאות ושיבוץ לפי הסמכה</h2>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>הסמכה</TableHead>
                <TableHead>תאריכים</TableHead>
                <TableHead>מיקום</TableHead>
                <TableHead>הקצאה</TableHead>
                <TableHead>שובצו</TableHead>
                <TableHead>פנוי</TableHead>
                <TableHead>עתודה</TableHead>
                <TableHead>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certifications.map((c) => (
                <TableRow key={c.certification_id}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" href={certificationHref(c.certification_id)}>
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <DateRange start={c.start_date} end={c.end_date} />
                  </TableCell>
                  <TableCell>{c.location ?? "-"}</TableCell>
                  <TableCell>{c.allocated_slots ?? "-"}</TableCell>
                  <TableCell>{c.registered}</TableCell>
                  <TableCell
                    className={c.remaining && c.remaining > 0 ? "text-amber-700 font-semibold" : ""}
                  >
                    {c.remaining ?? "-"}
                  </TableCell>
                  <TableCell>{c.reserve || "-"}</TableCell>
                  <TableCell>
                    <CertificationStatusBadge status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
              {certifications.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    אין הסמכות המשויכות לגדוד.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">פערי הסמכות של הגדוד</h2>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>הסמכה</TableHead>
                <TableHead>חסרים</TableHead>
                <TableHead>עתידים לצאת</TableHead>
                <TableHead>נשלחו</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gaps.map((g) => (
                <TableRow key={g.row_id}>
                  <TableCell className="font-medium">{g.certification_name}</TableCell>
                  <TableCell className={g.gap > 0 ? "text-rose-700 font-semibold" : ""}>
                    {g.gap}
                  </TableCell>
                  <TableCell>{g.pending}</TableCell>
                  <TableCell>{g.sent}</TableCell>
                </TableRow>
              ))}
              {gaps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    אין פערים פתוחים לגדוד.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        דרישות הגדוד: {requests.open} פתוחות מתוך {requests.total} בסך הכול.{" "}
        <Link className="underline" href="/requests">
          לדרישות הגדוד
        </Link>
      </p>
    </div>
  );
}
