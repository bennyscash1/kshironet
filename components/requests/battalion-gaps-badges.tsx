"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { GapRow } from "@/lib/db/repositories/certification-gaps";

export function BattalionGapsBadges({
  rows,
  battalionId,
  canEdit,
}: {
  rows: GapRow[];
  battalionId: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function updateGap(rowId: number, value: string) {
    const gapCount = Math.max(0, Number(value) || 0);
    await fetch(`/api/certification-gaps/${rowId}/value`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ battalion_id: battalionId, gap_count: gapCount }),
    });
    startTransition(() => router.refresh());
  }

  async function updateSent(rowId: number, value: string) {
    const sentCount = Math.max(0, Number(value) || 0);
    await fetch(`/api/certification-gaps/${rowId}/sent`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ battalion_id: battalionId, sent_count: sentCount }),
    });
    startTransition(() => router.refresh());
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">אין נתונים עדיין.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {rows.map((row) => {
        const gap = row.values[battalionId] ?? 0;
        const pending = row.pendingValues[battalionId] ?? 0;
        const sent = row.sentValues[battalionId] ?? 0;
        return (
          <div key={row.id} className="w-48 rounded-xl border bg-card shadow-sm p-3 space-y-2">
            <Link
              href={`/templates/course/${encodeURIComponent(row.certification_name)}`}
              className="block font-semibold text-sm hover:underline truncate"
              title={row.certification_name}
            >
              {row.certification_name}
            </Link>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">פער</p>
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    defaultValue={gap}
                    onBlur={(e) => updateGap(row.id, e.target.value)}
                    className="w-full h-8 rounded-md border border-rose-200 bg-rose-50 text-center text-rose-600 font-bold text-lg focus:outline-none focus:ring-1 focus:ring-rose-400"
                  />
                ) : (
                  <p className="text-rose-600 font-bold text-xl">{gap}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">עתידים לצאת</p>
                <p className="text-amber-500 font-bold text-xl">{pending}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">יצאו</p>
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    defaultValue={sent}
                    onBlur={(e) => updateSent(row.id, e.target.value)}
                    className="w-full h-8 rounded-md border bg-muted/50 text-center text-muted-foreground font-bold text-lg focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                ) : (
                  <p className="text-muted-foreground font-bold text-xl">{sent}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
