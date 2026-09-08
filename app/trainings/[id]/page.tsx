import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getTrainingById, listSessionsForTraining } from "@/lib/db/repositories/trainings";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getCurrentRole } from "@/lib/auth/current-role";
import { getCurrentUser } from "@/lib/auth/user";
import { canManageTrainings, canEdit } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { DateRange } from "@/components/ui/date-range";
import { SessionCard } from "@/components/trainings/session-card";
import { DeleteTrainingButton } from "@/components/trainings/delete-training-button";
import { TrainingPdfExport } from "@/components/trainings/training-pdf-export";
import { getWeekNumber, getHebrewDayRangeLabel, getHebrewWeekdayShort } from "@/lib/utils/dates";
import { Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const training = await getTrainingById(Number(id));
  if (!training) notFound();

  const [sessions, battalions, role, me] = await Promise.all([
    listSessionsForTraining(training.id),
    listBattalions(),
    getCurrentRole(),
    getCurrentUser(),
  ]);
  const canManage = canManageTrainings(role) && canEdit(me);
  const battalionMap = new Map(battalions.map((b) => [b.id, b]));

  // Group sessions by day, preserving date order (repo already orders by date/time).
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = byDay.get(s.session_date) ?? [];
    list.push(s);
    byDay.set(s.session_date, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{training.name}</h1>
          <p className="text-muted-foreground text-sm">{training.domain ?? "ללא תחום"}</p>
          <p className="text-sm mt-1 flex items-center gap-2">
            <DateRange start={training.start_date} end={training.end_date} />
            <span className="text-xs text-muted-foreground">
              שבוע {getWeekNumber(training.start_date)} ·{" "}
              {getHebrewDayRangeLabel(training.start_date, training.end_date)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <TrainingPdfExport training={training} sessions={sessions} battalions={battalions} />
          {canManage && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/trainings/${training.id}/edit`}>
                  <Pencil className="size-4" />
                  עריכה
                </Link>
              </Button>
              <DeleteTrainingButton trainingId={training.id} trainingName={training.name} />
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-1">
        <div className="text-sm font-medium text-muted-foreground">איש קשר</div>
        {training.contact_name || training.contact_phone ? (
          <div className="text-sm">
            {training.contact_name}
            {training.contact_phone ? (
              <span className="text-muted-foreground" dir="ltr">
                {" "}
                {training.contact_phone}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">אין איש קשר</div>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-1">
        <div className="text-sm font-medium text-muted-foreground">הערות</div>
        <div className="text-sm whitespace-pre-wrap">
          {training.notes || <span className="text-muted-foreground">אין הערות</span>}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">מעקב ביצוע ההדרכה ביחידות</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין מקצי הדרכה ליחידות</p>
        ) : (
          [...byDay.entries()].map(([day, daySessions]) => (
            <div key={day} className="space-y-2">
              <div className="text-sm font-medium">
                יום {getHebrewWeekdayShort(day)}, {format(new Date(day), "dd/MM/yyyy")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {daySessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    trainingId={training.id}
                    session={s}
                    battalion={battalionMap.get(s.battalion_id)}
                    battalions={battalions}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
