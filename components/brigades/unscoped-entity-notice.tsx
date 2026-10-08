import { AlertTriangle } from "lucide-react";
import { BLOCKED_ENTITIES, type BlockedEntity } from "@/lib/brigades/unscoped-guard";

/**
 * The notice shown on a screen whose entity cannot currently be created.
 *
 * Deliberately factual rather than reassuring: it names the entity, says why creating it
 * is refused, states what still works, and gives the two ways out. The screen itself is
 * NOT hidden — hiding it would make a defined state look like a bug, and existing rows
 * remain fully viewable and editable.
 *
 * A server component: the block condition is resolved on the server via
 * `isUnscopedEntityBlockActive()` and passed down, so no client fetch can flash the
 * create button before the notice appears.
 */
export function UnscopedEntityNotice({ entity }: { entity: BlockedEntity }) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div className="space-y-1 text-sm">
        <p className="font-semibold">
          לא ניתן ליצור {BLOCKED_ENTITIES[entity]} כרגע
        </p>
        <p className="text-muted-foreground">
          במערכת קיימת יותר מחטיבה אחת פעילה, והישות הזו עדיין אינה משויכת לחטיבה. יצירה
          במצב זה הייתה מערבבת נתונים בין החטיבות בלי להודיע על כך — שורה אחת בלבד מספיקה
          כדי שהנתונים של שתי החטיבות יוצגו כמספר אחד משותף. צפייה ועריכה של רשומות קיימות
          ממשיכות לעבוד כרגיל.
        </p>
        <p className="text-muted-foreground">
          היצירה תתאפשר לאחר שיושלם בידוד הנתונים בין חטיבות, או אם תושבת אחת החטיבות
          במסך ניהול החטיבות.
        </p>
      </div>
    </div>
  );
}
