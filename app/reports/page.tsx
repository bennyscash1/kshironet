import { addDays, format } from "date-fns";
import { getCertificationBattalions, listCertifications } from "@/lib/db/repositories/certifications";
import { getTrainingBattalions, listTrainings } from "@/lib/db/repositories/trainings";
import { getExportData, getTrainingExportData } from "@/lib/db/repositories/export";
import { getBattalionScope } from "@/lib/auth/scope";
import {
  certificationToCalendarItem,
  trainingToCalendarItem,
  scopeCalendarItemToBattalion,
  type CalendarItem,
} from "@/components/calendar/types";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ExportReportBody } from "@/components/reports/export-report-body";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: fromParam, to: toParam } = await searchParams;
  const today = new Date();
  // Default range: today → one week ahead. `format` uses local time, so no UTC
  // off-by-one. Explicit ?? params still let the user pick any range manually.
  const from = fromParam ?? format(today, "yyyy-MM-dd");
  const to = toParam ?? format(addDays(today, 7), "yyyy-MM-dd");

  // Battalion-scoped roles get a report limited to their own battalion; for global roles
  // `scope` is null and every call below is unfiltered exactly as before.
  const scope = await getBattalionScope();

  const [certs, trainings] = await Promise.all([
    getExportData(from, to, scope?.code).then((rows) =>
      rows.sort((a, b) => a.start_date.localeCompare(b.start_date))
    ),
    getTrainingExportData(from, to, scope?.code),
  ]);

  const [certGanttItems, trainingGanttItems] = await Promise.all([
    listCertifications({ from, to, battalionCode: scope?.code })
      .then((rows) => rows.filter((c) => c.status !== "cancelled"))
      .then((rows) =>
        Promise.all(
          rows.map(async (c) =>
            certificationToCalendarItem({ ...c, battalions: await getCertificationBattalions(c.id) })
          )
        )
      ),
    listTrainings({ from, to }).then((rows) =>
      Promise.all(rows.map(async (t) => trainingToCalendarItem(t, await getTrainingBattalions(t.id))))
    ),
  ]);

  // Trainings have no battalion column (their units come from sessions), so the scope is
  // applied after their battalion refs are resolved.
  const scopedTrainingGanttItems = scope
    ? trainingGanttItems.filter((t) => t.battalions.some((b) => b.code === scope.code))
    : trainingGanttItems;

  const ganttItems: CalendarItem[] = [...certGanttItems, ...scopedTrainingGanttItems].map(
    (item) => (scope ? scopeCalendarItemToBattalion(item, scope.code) : item)
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">סיכום לפי טווח תאריכים</h1>
      <DateRangePicker from={from} to={to} />
      <ExportReportBody certs={certs} trainings={trainings} ganttItems={ganttItems} from={from} to={to} />
    </div>
  );
}
