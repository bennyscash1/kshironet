import { addDays, format, subDays } from "date-fns";
import { battalionRosterReport } from "@/lib/db/repositories/reports";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getBattalionScope } from "@/lib/auth/scope";
import { BattalionRosterReport } from "@/components/reports/battalion-roster-report";

export const dynamic = "force-dynamic";

/**
 * Which soldiers are going out to which certification, filtered by battalion.
 *
 * For the two battalion-scoped roles the filter is forced to their own `battalion_id`
 * server-side, so no other unit's soldier is in the payload at all — and therefore cannot
 * appear in the Excel or PDF exports either. For the global roles the battalion is a
 * selectable filter and defaults to every battalion.
 */
export default async function BattalionRosterReportPage({
  searchParams,
}: {
  searchParams: Promise<{ battalion?: string; from?: string; to?: string }>;
}) {
  const { battalion: battalionParam, from: fromParam, to: toParam } = await searchParams;
  const today = new Date();
  // Default range: a month back → a month ahead, i.e. who recently went out and who is
  // about to. `format` uses local time, so no UTC off-by-one.
  const from = fromParam ?? format(subDays(today, 30), "yyyy-MM-dd");
  const to = toParam ?? format(addDays(today, 30), "yyyy-MM-dd");

  const scope = await getBattalionScope();
  const requested = battalionParam ? Number(battalionParam) : undefined;
  const battalionId = scope
    ? scope.battalionId
    : requested !== undefined && Number.isInteger(requested)
    ? requested
    : undefined;

  const allBattalions = await listBattalions();
  const rows = await battalionRosterReport({ battalionId, from, to });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">חיילים לפי הסמכה וגדוד</h1>
      <BattalionRosterReport
        rows={rows}
        // Under a scope the picker is a fixed label, so the other units' names never ship
        // to the browser with the page.
        battalions={scope ? [] : allBattalions}
        battalionId={battalionId}
        lockedBattalionName={scope ? scope.battalion?.name ?? "הגדוד שלי" : null}
        from={from}
        to={to}
      />
    </div>
  );
}
