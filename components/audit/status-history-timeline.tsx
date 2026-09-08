import { listStatusHistory } from "@/lib/db/repositories/audit";
import type { EntityType } from "@/lib/types";

export async function StatusHistoryTimeline({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: number;
}) {
  const history = await listStatusHistory(entityType, entityId);

  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">אין היסטוריה עדיין.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {history.map((h) => (
        <li key={h.id} className="border-e-2 ps-3 pe-1 border-muted">
          <span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString("he-IL")}</span>
          {" · "}
          <span>
            {h.old_status ? `${h.old_status} ← ` : ""}
            <strong>{h.new_status}</strong>
          </span>
          {h.note && <span className="text-muted-foreground"> — {h.note}</span>}
        </li>
      ))}
    </ul>
  );
}
