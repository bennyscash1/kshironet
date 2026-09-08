"use client";

import { useEffect, useMemo, useRef } from "react";
import { format, isSameDay } from "date-fns";
import { CertificationChipDetailed } from "@/components/calendar/certification-chip";
import { calendarSortPriority, type CalendarItem } from "@/components/calendar/types";
import { civilDate, weekStartOf } from "@/lib/calendar/anchor";
import { cn } from "@/lib/utils";

/**
 * The agenda list, opening on the anchored week.
 *
 * WHAT CHANGED. This view used to render EVERY item in the dataset sorted ascending, so a
 * fresh entry started at the earliest certification on record — months or years before
 * today — and today's group sat far down an unscrolled list. It now starts at the anchored
 * week's SUNDAY (not at today, so a user who opens the page on a Wednesday still sees what
 * already happened this week) and scrolls today's group into view.
 *
 * Earlier items are not discarded silently: they are summarised in a single line above the
 * list, so nothing is hidden without saying so.
 */
export function AgendaView({
  items,
  anchor,
  today,
}: {
  items: CalendarItem[];
  anchor: Date;
  today: Date;
}) {
  const todayRef = useRef<HTMLDivElement | null>(null);

  const { groups, earlierCount } = useMemo(() => {
    const fromIso = format(weekStartOf(anchor), "yyyy-MM-dd");
    const sorted = [...items].sort((a, b) => a.start_date.localeCompare(b.start_date));
    // String comparison IS date comparison for 'yyyy-MM-dd', so this needs no parsing and
    // no timezone conversion.
    const visible = sorted.filter((i) => i.start_date.slice(0, 10) >= fromIso);

    const map = new Map<string, CalendarItem[]>();
    for (const item of visible) {
      const key = item.start_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return { groups: [...map.entries()], earlierCount: sorted.length - visible.length };
  }, [items, anchor]);

  // After the groups are in the DOM. Re-runs when the items change, because the list is
  // rebuilt then and the previous node is gone.
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [groups]);

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {earlierCount > 0
          ? "אין פריטים מהשבוע הנוכחי ואילך."
          : "אין פריטים להצגה."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {earlierCount > 0 && (
        <p className="text-xs text-muted-foreground">
          מוצג מהשבוע הנוכחי ואילך · {earlierCount} פריטים מוקדמים יותר אינם מוצגים
        </p>
      )}
      {groups.map(([date, dayItems]) => {
        const day = civilDate(date.slice(0, 10));
        const isToday = day !== null && isSameDay(day, today);
        return (
          <div key={date} ref={isToday ? todayRef : undefined}>
            <h3
              className={cn(
                "text-sm font-semibold mb-2",
                isToday ? "text-primary" : "text-muted-foreground"
              )}
            >
              {format(day ?? new Date(date), "EEEE, d MMMM yyyy")}
              {isToday && " · היום"}
            </h3>
            <div className="space-y-2">
              {[...dayItems]
                .sort((a, b) => calendarSortPriority(a.kind) - calendarSortPriority(b.kind))
                .map((item) => (
                  <CertificationChipDetailed key={item.key} item={item} />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
