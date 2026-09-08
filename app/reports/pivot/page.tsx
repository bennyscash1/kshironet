import { format } from "date-fns";
import { listBattalions } from "@/lib/db/repositories/battalions";
import {
  runPivotReport,
  listDomainsWithCertifications,
} from "@/lib/db/repositories/certification-pivot";
import { listSavedWidgets } from "@/lib/db/repositories/pivot-widgets";
import { pivotWidgetConfigSchema } from "@/lib/validation/pivot";
import { getBattalionScope } from "@/lib/auth/scope";
import { PivotWidgets, type SavedWidgetView } from "@/components/reports/pivot-widgets";

export const dynamic = "force-dynamic";

export default async function PivotReportPage() {
  // Picker data and saved widgets are read here so the first paint needs no client
  // round-trip; /api/reports/pivot/{options,widgets} serve the same data for refreshes.
  // Battalion-scoped roles may only chart their own battalion, so it is the only option
  // offered — and /api/reports/pivot enforces the same limit server-side.
  const scope = await getBattalionScope();
  const [allBattalions, domains, saved] = await Promise.all([
    listBattalions(),
    listDomainsWithCertifications(),
    listSavedWidgets(),
  ]);
  const battalions = scope
    ? allBattalions.filter((b) => b.id === scope.battalionId)
    : allBattalions;

  // Counts for saved widgets are computed here so their charts are on screen right
  // away. `config` is jsonb, so it is re-validated before use — a hand-edited or stale
  // row degrades to "press עדכן" instead of throwing on the page.
  // Saved widgets are shared configuration, so one may well name battalions a scoped user
  // may not see. Their battalion list is clamped to the caller's own before the counts are
  // computed — the other columns are never queried, let alone sent.
  const savedWidgets: SavedWidgetView[] = await Promise.all(
    saved.map(async (widget) => {
      const parsed = pivotWidgetConfigSchema.safeParse(widget.config);
      if (!parsed.success) return { widget, report: null };
      const filters = scope
        ? {
            ...parsed.data,
            battalionIds: parsed.data.battalionIds.filter((id) => id === scope.battalionId),
          }
        : parsed.data;
      return { widget, report: await runPivotReport(filters) };
    })
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">פילוח הסמכות</h1>
      <PivotWidgets
        battalions={battalions}
        domains={domains}
        today={format(new Date(), "yyyy-MM-dd")}
        savedWidgets={savedWidgets}
      />
    </div>
  );
}
