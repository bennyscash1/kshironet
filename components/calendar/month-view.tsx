"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  startOfMonth,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  format,
  addMonths,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";
import type { CalendarItem } from "@/components/calendar/types";
import {
  assignLanes,
  chunkIntoWeeks,
  isBanner,
  WeekRow,
  WeekdayHeader,
  MONTH_LANE_HEIGHT,
} from "@/components/calendar/week-row";
import { isSameCalendarWeek, weekStartOf, WEEK_STARTS_ON } from "@/lib/calendar/anchor";

/**
 * The month containing the anchor.
 *
 * WHAT CHANGED. The grid is still a whole month — that is the view's job — but the month
 * now comes from the shared anchor instead of a private `useState(new Date())`, and the
 * week containing today is highlighted and scrolled into view. Previously the only thing
 * marking "now" was a border on today's cell, and nothing brought it into the viewport, so
 * landing on the page put the 1st of the month in front of the user and left today's week
 * wherever it happened to fall.
 */
export function MonthView({
  items,
  anchor,
  today,
  onAnchorChange,
}: {
  items: CalendarItem[];
  anchor: Date;
  today: Date;
  /** Reports a new anchor as 'yyyy-MM-dd' so the other views follow the month step. */
  onAnchorChange: (iso: string) => void;
}) {
  const start = weekStartOf(startOfMonth(anchor));
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON });
  const days = eachDayOfInterval({ start, end });
  const weeks = chunkIntoWeeks(days);

  const barItems = useMemo(() => items.filter(isBanner), [items]);
  const singleDayItems = useMemo(() => items.filter((c) => !isBanner(c)), [items]);
  const laneOf = useMemo(() => assignLanes(barItems), [barItems]);

  const currentWeekRef = useRef<HTMLDivElement | null>(null);

  // Runs after the rows exist AND again whenever the items change, because the bars are
  // what give a row its final height — scrolling before they are laid out lands on the
  // wrong offset. `block: "nearest"` scrolls the page only when the row is actually out of
  // view, so an already-visible current week does not make the page jump on every render.
  useEffect(() => {
    currentWeekRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [anchor, items]);

  const stepMonth = (delta: number) =>
    onAnchorChange(format(addMonths(anchor, delta), "yyyy-MM-dd"));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Button variant="outline" size="icon" onClick={() => stepMonth(-1)} aria-label="חודש קודם">
          <ChevronRight className="size-4" />
        </Button>
        <h2 className="font-semibold">{format(anchor, "MMMM yyyy")}</h2>
        <Button variant="outline" size="icon" onClick={() => stepMonth(1)} aria-label="חודש הבא">
          <ChevronLeft className="size-4" />
        </Button>
      </div>
      <WeekdayHeader />
      <div className="space-y-1">
        {weeks.map((week) => {
          // The week containing today, not the week containing the anchor: when the user
          // has paged to another month there is no current week on screen, and nothing
          // should be highlighted.
          const isCurrentWeek = isSameCalendarWeek(week[0], today);
          return (
            <div key={week[0].toISOString()} ref={isCurrentWeek ? currentWeekRef : undefined}>
              <WeekRow
                week={week}
                month={anchor}
                barItems={barItems}
                laneOf={laneOf}
                singleDayItems={singleDayItems}
                laneHeight={MONTH_LANE_HEIGHT}
                isCurrentWeek={isCurrentWeek}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
