"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import type { GapRow } from "@/lib/db/repositories/certification-gaps";

export function BattalionGapsTable({
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

  const gapTotal = rows.reduce((sum, r) => sum + (r.values[battalionId] ?? 0), 0);
  const sentTotal = rows.reduce((sum, r) => sum + (r.sentValues[battalionId] ?? 0), 0);

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="p-2 text-start font-bold">שם ההסמכה</th>
            <th className="p-2 font-bold">פער</th>
            <th className="p-2 font-bold">נשלחו</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="p-2 font-medium">
                <Link
                  href={`/templates/course/${encodeURIComponent(row.certification_name)}`}
                  className="hover:underline"
                >
                  {row.certification_name}
                </Link>
              </td>
              <td className="p-1 text-center">
                {canEdit ? (
                  <Input
                    type="number"
                    min={0}
                    defaultValue={row.values[battalionId] ?? 0}
                    className="h-8 w-16 text-center mx-auto"
                    onBlur={(e) => updateGap(row.id, e.target.value)}
                  />
                ) : (
                  (row.values[battalionId] ?? 0)
                )}
              </td>
              <td className="p-1 text-center">
                {canEdit ? (
                  <Input
                    type="number"
                    min={0}
                    defaultValue={row.sentValues[battalionId] ?? 0}
                    className="h-8 w-16 text-center mx-auto"
                    onBlur={(e) => updateSent(row.id, e.target.value)}
                  />
                ) : (
                  (row.sentValues[battalionId] ?? 0)
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="p-3 text-center text-muted-foreground">
                אין נתונים עדיין.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 bg-muted/30">
              <td className="p-2 font-bold">סה״כ</td>
              <td className="p-2 text-center font-bold">{gapTotal}</td>
              <td className="p-2 text-center font-bold">{sentTotal}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
