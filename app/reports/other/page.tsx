import {
  certificationsByMonth,
  completedCertifications,
  gapsByBattalion,
  openForRegistration,
  openRequestsByBattalion,
  rosterCounts,
} from "@/lib/db/repositories/reports";
import { ExportExcelButton } from "@/components/reports/export-excel-button";
import { getBattalionScope } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";

function ReportSection({
  title,
  data,
  filename,
  render,
}: {
  title: string;
  data: Record<string, unknown>[];
  filename: string;
  render: (row: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <section className="space-y-2 border rounded-md p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <ExportExcelButton data={data} filename={filename} />
      </div>
      <div className="space-y-1 text-sm">
        {data.map((row, i) => (
          <div key={i} className="flex justify-between border-b py-1 last:border-0">
            {render(row)}
          </div>
        ))}
        {data.length === 0 && <p className="text-muted-foreground">אין נתונים.</p>}
      </div>
    </section>
  );
}

export default async function OtherReportsPage() {
  // Battalion-scoped roles get every one of these reports filtered to their own battalion
  // in SQL; for global roles `scopedId` is undefined and each query is the original,
  // system-wide one.
  const scope = await getBattalionScope();
  const scopedId = scope?.battalionId;

  const byMonth = (await certificationsByMonth(scopedId)) as { month: string; count: number }[];
  const open = (await openForRegistration(scopedId)) as {
    id: number;
    name: string;
    location: string | null;
    start_date: string;
  }[];
  const completed = (await completedCertifications(scopedId)) as {
    id: number;
    name: string;
    location: string | null;
    start_date: string;
  }[];
  const requestsByBattalion = (await openRequestsByBattalion(scopedId)) as {
    battalion_name: string;
    count: number;
  }[];
  const gaps = (await gapsByBattalion(scopedId)) as {
    battalion_name: string;
    total_requested: number;
    fulfilled: number;
  }[];
  const counts = (await rosterCounts(scopedId)) as {
    id: number;
    name: string;
    location: string | null;
    registered_count: number;
  }[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">דוחות נוספים</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportSection
          title="הסמכות לפי חודש"
          data={byMonth}
          filename="certifications_by_month"
          render={(r) => (
            <>
              <span>{r.month as string}</span>
              <span>{r.count as number}</span>
            </>
          )}
        />
        <ReportSection
          title="הסמכות פתוחות להרשמה"
          data={open}
          filename="open_for_registration"
          render={(r) => (
            <>
              <span>
                {r.name as string}
                {r.location ? (
                  <span className="text-muted-foreground text-xs"> · {r.location as string}</span>
                ) : null}
              </span>
              <span>{r.start_date as string}</span>
            </>
          )}
        />
        <ReportSection
          title="הסמכות שבוצעו"
          data={completed}
          filename="completed_certifications"
          render={(r) => (
            <>
              <span>
                {r.name as string}
                {r.location ? (
                  <span className="text-muted-foreground text-xs"> · {r.location as string}</span>
                ) : null}
              </span>
              <span>{r.start_date as string}</span>
            </>
          )}
        />
        <ReportSection
          title="דרישות פתוחות לפי גדוד"
          data={requestsByBattalion}
          filename="open_requests_by_battalion"
          render={(r) => (
            <>
              <span>{r.battalion_name as string}</span>
              <span>{r.count as number}</span>
            </>
          )}
        />
        <ReportSection
          title="פערי הסמכה לפי גדוד"
          data={gaps}
          filename="gaps_by_battalion"
          render={(r) => (
            <>
              <span>{r.battalion_name as string}</span>
              <span>
                {r.fulfilled as number} / {r.total_requested as number}
              </span>
            </>
          )}
        />
        <ReportSection
          title="כמות חיילים רשומים לכל הסמכה"
          data={counts}
          filename="roster_counts"
          render={(r) => (
            <>
              <span>
                {r.name as string}
                {r.location ? (
                  <span className="text-muted-foreground text-xs"> · {r.location as string}</span>
                ) : null}
              </span>
              <span>{r.registered_count as number}</span>
            </>
          )}
        />
      </div>
    </div>
  );
}
