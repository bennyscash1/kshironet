"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSameDay,
  min,
  max,
} from "date-fns";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { battalionBarStyle } from "@/lib/utils/battalion-style";
import type { CalendarItem } from "@/components/calendar/types";
import { getWeekNumber, getHebrewWeekdayShort } from "@/lib/utils/dates";
import { compareCalendarItems } from "@/components/calendar/types";
import { isSameCalendarWeek } from "@/lib/calendar/anchor";
import { cn } from "@/lib/utils";

const DAY_MIN_WIDTH = 40;
const LABEL_WIDTH = 220;

/**
 * WHAT CHANGED HERE. The timeline still spans every item — narrowing it would hide bars,
 * which is not what this fix is for — but the horizontal scroll no longer starts at the
 * earliest certification on record. It lands on the current week.
 *
 * The scroll runs TWICE on purpose: once in a layout effect, and again from an effect that
 * re-fires when `items` changes. The bars are absolutely positioned as percentages of a
 * grid whose width depends on the day count, so a single early scroll can compute its
 * offset before the row widths settle and silently land in the wrong place.
 */
export function GanttView({
  items,
  today,
  rangeStart: rangeStartOverride,
  rangeEnd: rangeEndOverride,
}: {
  items: CalendarItem[];
  /** Today in Asia/Jerusalem, from the shared anchor. */
  today: Date;
  rangeStart?: Date;
  rangeEnd?: Date;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentWeekRef = useRef<HTMLDivElement | null>(null);

  // `inline: "center"` puts the current week in the middle of the viewport, and letting
  // the browser do it avoids hand-computing scrollLeft — whose sign and origin differ
  // between engines in an RTL container, which is exactly the bug this would otherwise
  // reintroduce. `block: "nearest"` keeps the page from scrolling vertically as a side
  // effect.
  // Only the calendar's own live gantt auto-scrolls. When a caller pins the range — the
  // PDF export does — the window it asked for is the window it gets, and scrolling could
  // move the capture off it.
  const autoScroll = !rangeStartOverride || !rangeEndOverride;
  const scrollToCurrentWeek = () => {
    if (!autoScroll) return;
    currentWeekRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "auto",
    });
  };

  useLayoutEffect(scrollToCurrentWeek, [autoScroll]);
  useEffect(scrollToCurrentWeek, [items, today, autoScroll]);
  const { rangeStart, rangeEnd, days } = useMemo(() => {
    if (rangeStartOverride && rangeEndOverride) {
      return {
        rangeStart: rangeStartOverride,
        rangeEnd: rangeEndOverride,
        days: eachDayOfInterval({ start: rangeStartOverride, end: rangeEndOverride }),
      };
    }
    if (items.length === 0) {
      const start = addDays(today, -7);
      const end = addDays(today, 30);
      return { rangeStart: start, rangeEnd: end, days: eachDayOfInterval({ start, end }) };
    }
    const starts = items.map((c) => new Date(c.start_date));
    const ends = items.map((c) => new Date(c.end_date ?? c.start_date));
    const start = min([...starts, addDays(today, -7)]);
    const end = max([...ends, addDays(today, 14)]);
    return { rangeStart: start, rangeEnd: end, days: eachDayOfInterval({ start, end }) };
  }, [items, today, rangeStartOverride, rangeEndOverride]);

  const weekGroups = useMemo(() => {
    const groups: { weekNumber: number; count: number; isCurrent: boolean }[] = [];
    for (const d of days) {
      const wn = getWeekNumber(d);
      const last = groups[groups.length - 1];
      if (last && last.weekNumber === wn) {
        last.count += 1;
      } else {
        groups.push({ weekNumber: wn, count: 1, isCurrent: isSameCalendarWeek(d, today) });
      }
    }
    return groups;
  }, [days, today]);

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">אין פריטים להצגה בטווח זה.</p>;
  }

  const daysAreaMinWidth = days.length * DAY_MIN_WIDTH;
  const dayColumns = `repeat(${days.length}, minmax(${DAY_MIN_WIDTH}px, 1fr))`;

  return (
    <div ref={scrollRef} className="overflow-x-auto border rounded-md">
      <div className="w-full">
        <div className="flex sticky top-0 bg-card z-10">
          <div
            className="shrink-0 border-e border-b p-2 text-xs font-medium text-muted-foreground"
            style={{ width: LABEL_WIDTH }}
          >
            פריט
          </div>
          <div
            className="grid border-b flex-1"
            style={{ gridTemplateColumns: dayColumns, minWidth: daysAreaMinWidth }}
          >
            {weekGroups.map((g, i) => (
              <div
                key={i}
                className={cn(
                  "text-center text-[10px] py-1 border-e font-bold",
                  g.isCurrent
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary"
                )}
                style={{ gridColumn: `span ${g.count}` }}
              >
                שבוע {g.weekNumber}
              </div>
            ))}
          </div>
        </div>
        <div className="flex sticky top-6 bg-card z-10 border-b">
          <div className="shrink-0 border-e" style={{ width: LABEL_WIDTH }}></div>
          <div
            className="grid flex-1"
            style={{ gridTemplateColumns: dayColumns, minWidth: daysAreaMinWidth }}
          >
            {days.map((d) => {
              const inCurrentWeek = isSameCalendarWeek(d, today);
              return (
                <div
                  key={d.toISOString()}
                  // The scroll target is TODAY's column, so the week is centred on the day
                  // the user actually came to see.
                  ref={isSameDay(d, today) ? currentWeekRef : undefined}
                  className={cn(
                    "text-center text-[10px] py-1.5 border-e leading-tight",
                    inCurrentWeek
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground"
                  )}
                >
                  <div className="font-medium">{getHebrewWeekdayShort(d)}</div>
                  <div>{format(d, "d/M")}</div>
                </div>
              );
            })}
          </div>
        </div>
        {[...items].sort(compareCalendarItems).map((item) => {
          const itemStart = new Date(item.start_date);
          const itemEnd = new Date(item.end_date ?? item.start_date);
          const isTrueStart = itemStart >= rangeStart;
          const isTrueEnd = itemEnd <= rangeEnd;
          const clippedStart = max([itemStart, rangeStart]);
          const clippedEnd = min([itemEnd, rangeEnd]);
          const offset = differenceInCalendarDays(clippedStart, rangeStart);
          const duration = differenceInCalendarDays(clippedEnd, clippedStart) + 1;
          const rightPct = (offset / days.length) * 100;
          const widthPct = (duration / days.length) * 100;
          return (
            <div key={item.key} className="flex border-b hover:bg-accent/30">
              <div
                className="shrink-0 border-e p-2 text-xs flex items-center gap-1 overflow-hidden"
                style={{ width: LABEL_WIDTH }}
              >
                {item.battalions.map((b) => (
                  <span
                    key={b.code}
                    className="size-2 rounded-full shrink-0"
                    style={battalionBarStyle(b.color_hex)}
                  />
                ))}
                <div className="min-w-0">
                  <Link href={item.href} className="hover:underline truncate flex items-center gap-1">
                    {item.kind === "training" && (
                      <GraduationCap className="size-3 shrink-0 text-muted-foreground" aria-label="הדרכה" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </Link>
                  {item.location && (
                    <div className="text-[10px] text-muted-foreground truncate">{item.location}</div>
                  )}
                </div>
              </div>
              <div
                className="relative flex-1"
                style={{ height: 40, minWidth: daysAreaMinWidth }}
              >
                <Link
                  href={item.href}
                  className={cn(
                    "absolute top-1.5 h-7 flex items-center gap-1 px-2 text-white overflow-hidden",
                    isTrueStart ? "rounded-s-md" : "rounded-s-none",
                    isTrueEnd ? "rounded-e-md" : "rounded-e-none",
                    item.kind === "training" &&
                      "outline outline-2 outline-dashed outline-white/70 -outline-offset-2"
                  )}
                  style={{
                    right: `${rightPct}%`,
                    width: `max(${widthPct}%, 20px)`,
                    backgroundColor: item.color,
                  }}
                  title={`${item.name}${item.location ? " · " + item.location : ""} (${item.start_date}${
                    item.end_date ? " - " + item.end_date : ""
                  })${!isTrueStart || !isTrueEnd ? " — ממשיך מחוץ לטווח המוצג" : ""}`}
                >
                  {item.kind === "training" && (
                    <GraduationCap className="size-3 shrink-0" aria-label="הדרכה" />
                  )}
                  <span className="truncate text-[13px] leading-tight">
                    <span className="font-bold">{item.name}</span>
                    {item.location && (
                      <span className="text-[11px] font-normal opacity-80"> - {item.location}</span>
                    )}
                  </span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
