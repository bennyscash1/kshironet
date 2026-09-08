import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getInfluencingFactorById,
  getInfluencingFactorBattalions,
} from "@/lib/db/repositories/influencing-factors";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { DateRange } from "@/components/ui/date-range";
import { getWeekNumber, getHebrewDayRangeLabel } from "@/lib/utils/dates";
import { Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InfluencingFactorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const factor = await getInfluencingFactorById(Number(id));
  if (!factor) notFound();

  const [battalions, me] = await Promise.all([
    getInfluencingFactorBattalions(factor.id),
    getCurrentUser(),
  ]);
  const canManage = canEdit(me);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{factor.name}</h1>
          <p className="text-sm mt-1 flex items-center gap-2">
            <DateRange start={factor.start_date} end={factor.end_date} />
            <span className="text-xs text-muted-foreground">
              שבוע {getWeekNumber(factor.start_date)} ·{" "}
              {getHebrewDayRangeLabel(factor.start_date, factor.end_date)}
            </span>
          </p>
        </div>
        {canManage && (
          <Button variant="outline" asChild>
            <Link href={`/influencing-factors/${factor.id}/edit`}>
              <Pencil className="size-4" />
              עריכה
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-1">
        <div className="text-sm font-medium text-muted-foreground">יחידות מושפעות</div>
        {battalions.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {battalions.map((b) => (
              <span key={b.code} className="font-medium" style={{ color: b.color_hex }}>
                {b.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">אין יחידות מושפעות</div>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-1">
        <div className="text-sm font-medium text-muted-foreground">הערות</div>
        <div className="text-sm whitespace-pre-wrap">
          {factor.notes || <span className="text-muted-foreground">אין הערות</span>}
        </div>
      </div>
    </div>
  );
}
