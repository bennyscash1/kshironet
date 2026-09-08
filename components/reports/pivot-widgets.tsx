"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PivotWidgetCard } from "@/components/reports/pivot-widget-card";
import type { Battalion, SavedPivotWidget } from "@/lib/types";
import type {
  PivotDomainOption,
  PivotReport,
} from "@/lib/db/repositories/certification-pivot";

/** A saved widget plus the report computed for it on the server, so its chart is on
 * screen immediately after a page load. */
export interface SavedWidgetView {
  widget: SavedPivotWidget;
  report: PivotReport | null;
}

/**
 * The widget board: every saved widget (global, straight from the database) plus any
 * in-progress widgets the current user is building.
 *
 * In-progress widgets live in React state only. The database is the source of truth for
 * saved ones, so after a save or delete the board re-reads the server component via
 * `router.refresh()` rather than patching a local copy.
 */
export function PivotWidgets({
  battalions,
  domains,
  today,
  savedWidgets,
}: {
  battalions: Battalion[];
  domains: PivotDomainOption[];
  /** Today's date (yyyy-MM-dd), resolved on the server so the first render matches. */
  today: string;
  savedWidgets: SavedWidgetView[];
}) {
  const router = useRouter();
  // Monotonic ids keep React keys stable when widgets in the middle are removed.
  // Start with one blank widget only when there is nothing saved to look at.
  const [draftIds, setDraftIds] = useState<number[]>(savedWidgets.length === 0 ? [1] : []);
  const [nextId, setNextId] = useState(2);

  function addWidget() {
    setDraftIds((prev) => [...prev, nextId]);
    setNextId((id) => id + 1);
  }

  function removeDraft(id: number) {
    setDraftIds((prev) => prev.filter((draftId) => draftId !== id));
  }

  /** A saved draft becomes a server-rendered saved widget — drop the local copy and
   * reload the board so it appears once, with its persisted config. */
  function handleSaved(id: number) {
    removeDraft(id);
    router.refresh();
  }

  const isEmpty = savedWidgets.length === 0 && draftIds.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          כל ווידג׳ט מציג עמודה לכל גדוד — גובה העמודה היא מספר הרשומות מאותו גדוד
          שנספרות בהסמכות שנבחרו, לפי הסטטוס האישי של כל חייל (אושר, נרשם, עבר הסמכה,
          השתתף). רשומות שאינן נספרות מוצגות בנפרד. ווידג׳ט שנשמר מוצג לכל המשתמשים.
        </p>
        <Button size="sm" onClick={addWidget}>
          <Plus className="size-4" />
          הוסף ווידג׳ט
        </Button>
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-4">
          אין ווידג׳טים. לחץ „הוסף ווידג׳ט“ כדי להתחיל.
        </p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {savedWidgets.map(({ widget, report }) => (
            <PivotWidgetCard
              key={widget.id}
              savedId={widget.id}
              defaultName={widget.name}
              battalions={battalions}
              domains={domains}
              defaultFromDate={today}
              initialConfig={widget.config}
              initialReport={report}
              onRemove={() => {}}
              onSaved={() => router.refresh()}
              onDeleted={() => router.refresh()}
            />
          ))}
          {draftIds.map((id) => (
            <PivotWidgetCard
              key={`draft-${id}`}
              // Keyed off the widget's own id, not its position, so the default name of
              // an existing widget never shifts when an earlier one is removed.
              defaultName={`ווידג׳ט ${id}`}
              battalions={battalions}
              domains={domains}
              defaultFromDate={today}
              onRemove={() => removeDraft(id)}
              onSaved={() => handleSaved(id)}
              onDeleted={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
