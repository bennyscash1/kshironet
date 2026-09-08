"use client";

import {
  differenceInCalendarDays,
  format,
  isSameDay,
  isSameMonth,
  max as maxDate,
  min as minDate,
} from "date-fns";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { CertificationChip } from "@/components/calendar/certification-chip";
import { compareCalendarItems, type CalendarItem } from "@/components/calendar/types";
import { getWeekNumber, getHebrewWeekdayShort } from "@/lib/utils/dates";
import { battalionBarStyle } from "@/lib/utils/battalion-style";
import { cn } from "@/lib/utils";

export const WEEKDAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];
export const DAY_NUMBER_HEIGHT = 20;
export const MONTH_LANE_HEIGHT = 26;
export const WEEK_LANE_HEIGHT = 22;

export function isMultiDay(item: CalendarItem): boolean {
  return Boolean(item.end_date) && item.end_date !== item.start_date;
}

export function itemEndDate(item: CalendarItem): string {
  return item.end_date ?? item.start_date;
}

/** Multi-day items plus single-day influencing factors, pinned to the top lanes. */
export function isBanner(item: CalendarItem): boolean {
  return isMultiDay(item) || item.kind === "influencing_factor";
}

export function chunkIntoWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** Stable vertical lane for a bar's whole span, so it does not jump across weeks. */
export function assignLanes(barItems: CalendarItem[]): Map<string, number> {
  const sorted = [...barItems].sort(compareCalendarItems);
  const laneEnds: string[] = [];
  const laneOf = new Map<string, number>();
  for (const item of sorted) {
    const end = itemEndDate(item);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < item.start_date);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    laneOf.set(item.key, lane);
  }
  return laneOf;
}

export type FillDot = "full" | "part" | "none";

const FILL_DOT: Record<FillDot, string> = {
  full: "#16a34a",
  part: "#e08a1e",
  none: "#dc2626",
};

export interface NameSlot {
  name: string | null;
}

export interface DayNameGroup {
  key: string;
  name: string;
  color: string;
  filled: number;
  /** Slots allocated to the battalion. NULL when it has no quota and is on the
   * certification only because it has soldiers there. */
  allocated: number | null;
  slots: NameSlot[];
  /** The brigade allocated slots but nobody has been named yet. Painted amber — see
   * AWAITING_NAMES below. */
  awaitingNames?: boolean;
  /** Open to every battalion — painted sky, see OPEN_TO_ALL. */
  openToAll?: boolean;
  onOpen?: () => void;
}

export interface WeekBarMeta {
  fill?: FillDot;
  battalionColor?: string;
  /** Same amber state as DayNameGroup.awaitingNames, for the calendar bar. */
  awaitingNames?: boolean;
  /** Open to every battalion and this one has registered nobody — see OPEN_TO_ALL. */
  openToAll?: boolean;
}

/**
 * "Allocated, nobody named yet" — one amber treatment, defined once and used by BOTH the
 * calendar bar and the "יוצאים להסמכה" row, so the same certification cannot read as
 * urgent in one place and ordinary in the other.
 *
 * It deliberately OVERRIDES the course colour. A course colour says "which course"; this
 * says "you owe this one names", which is the more urgent fact and the reason the row is
 * being looked at. Once a single name is on the allocation the course colour returns.
 */
export const AWAITING_NAMES = {
  /** amber-100 / amber-800 / amber-400, matching the Tailwind palette used elsewhere. */
  bg: "#fef3c7",
  ink: "#92400e",
  line: "#fbbf24",
  label: "הוקצה — טרם שובצו שמות",
} as const;

/**
 * The two kinds of new allocation, named for WHO issued them.
 *
 * "גדודית" (battalion) is an allocation the brigade set aside for one named battalion;
 * "חטיבית" (brigade) is a brigade-wide pool anyone may register into. Naming them by
 * issuer rather than by mechanism is what lets a reader tell them apart at a glance.
 */
export const NEW_BATTALION_ALLOCATION = "הקצאה גדודית חדשה";
export const NEW_BRIGADE_ALLOCATION = "הקצאה חטיבית חדשה";

/**
 * The badge inside a targeted allocation card, naming the battalion it was issued to:
 * "הקצאה חדשה לגדוד 9308".
 *
 * The battalion's own name is prefixed with "ל", which reads correctly for every unit in
 * the table — "לגדוד 9308", "לגדס\"מ", "למפח\"ט" — so it needs no per-unit special case.
 */
export function newAllocationForBattalion(battalionName: string): string {
  return `הקצאה חדשה ל${battalionName}`;
}

/**
 * "Open to every battalion" — a shared seat pool this unit may register into.
 *
 * It gets its OWN colour family rather than borrowing the amber above. Both states mean
 * "you can act on this", but they are not the same offer: an allocation was handed to this
 * battalion by name and nobody else can take those seats, while an open pool is first
 * come, first served. Painting them identically — which is what borrowing AWAITING_NAMES'
 * hex did — made the band's two groups indistinguishable without reading the label.
 *
 * sky-100 / sky-800 / sky-400, from the same Tailwind palette as the amber.
 */
export const OPEN_TO_ALL = {
  bg: "#e0f2fe",
  ink: "#075985",
  line: "#38bdf8",
  /** The calendar legend chip and the band badge. */
  label: NEW_BRIGADE_ALLOCATION,
  /** The dashboard band card, where there is room to say what the offer actually is. */
  bandLabel: "הקצאה פתוחה לרישום לכלל הגדודים",
} as const;


export interface WeekRowProps {
  week: Date[];
  /** When set, days outside this month are dimmed (month view). */
  month?: Date;
  barItems: CalendarItem[];
  laneOf: Map<string, number>;
  /** Single-day chips under the lanes (month view only). */
  singleDayItems?: CalendarItem[];
  laneHeight?: number;
  /** Month view keeps a taller cell so chips fit; week view uses the mockup formula. */
  minCellHeight?: number | "formula";
  metaByKey?: Record<string, WeekBarMeta>;
  /** Second row: names leaving for a cert that starts that day. */
  nameGroupsByDay?: DayNameGroup[][];
  onBarClick?: (item: CalendarItem) => void;
  emptyWeekMessage?: string;
  alignDayNumber?: "start" | "end";
  /** The week containing today — tinted so the landing viewport reads at a glance. */
  isCurrentWeek?: boolean;
}

function weekend(day: Date): boolean {
  return day.getDay() === 5 || day.getDay() === 6;
}

export function WeekRow({
  week,
  month,
  barItems,
  laneOf,
  singleDayItems = [],
  laneHeight = MONTH_LANE_HEIGHT,
  minCellHeight,
  metaByKey,
  nameGroupsByDay,
  onBarClick,
  emptyWeekMessage,
  alignDayNumber = "start",
  isCurrentWeek = false,
}: WeekRowProps) {
  const weekStart = week[0];
  const weekEnd = week[6];

  const weekBars = barItems
    .map((item) => {
      const itemStart = new Date(item.start_date);
      const itemEnd = new Date(itemEndDate(item));
      if (itemEnd < weekStart || itemStart > weekEnd) return null;
      const clippedStart = maxDate([itemStart, weekStart]);
      const clippedEnd = minDate([itemEnd, weekEnd]);
      return {
        item,
        startCol: differenceInCalendarDays(clippedStart, weekStart),
        endCol: differenceInCalendarDays(clippedEnd, weekStart),
        lane: laneOf.get(item.key) ?? 0,
        isTrueStart: itemStart >= weekStart,
        isTrueEnd: itemEnd <= weekEnd,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const laneCount = weekBars.length > 0 ? Math.max(...weekBars.map((b) => b.lane)) + 1 : 0;
  const formulaHeight = DAY_NUMBER_HEIGHT + Math.max(laneCount, 1) * laneHeight + 6;
  const barsHeight = DAY_NUMBER_HEIGHT + laneCount * laneHeight;
  const cellHeight =
    minCellHeight === "formula"
      ? formulaHeight
      : typeof minCellHeight === "number"
        ? minCellHeight
        : Math.max(96, barsHeight + 8);

  const showNames = Boolean(nameGroupsByDay);
  const anyStart = (nameGroupsByDay ?? []).some((g) => g.length > 0);
  const empty = weekBars.length === 0 && !anyStart && emptyWeekMessage;

  function singleDayItemsOnDay(day: Date) {
    return singleDayItems
      .filter((c) => isSameDay(day, new Date(c.start_date)))
      .sort(compareCalendarItems);
  }

  return (
    // A ring rather than a background: the day cells carry their own backgrounds
    // (weekend, out-of-month, today), and tinting the row would fight all three.
    <div
      className={cn(
        "grid grid-cols-8 gap-1 rounded-md",
        isCurrentWeek && "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-md text-xs font-bold",
          isCurrentWeek
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary"
        )}
      >
        {getWeekNumber(weekStart)}
      </div>
      <div className="relative" style={{ gridColumn: "span 7" }}>
        <div className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const dayItems = singleDayItemsOnDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                style={{ minHeight: cellHeight }}
                className={cn(
                  "border rounded-md p-1 flex flex-col",
                  month && !isSameMonth(day, month) && "bg-muted/30 text-muted-foreground",
                  !month && weekend(day) && "bg-muted/55",
                  isToday && "border-foreground border-2"
                )}
              >
                <div
                  className={cn(
                    "text-xs h-5 leading-5 px-0.5 shrink-0",
                    alignDayNumber === "end" && "text-end",
                    isToday && "font-extrabold"
                  )}
                >
                  {format(day, "d")}
                </div>
                {singleDayItems.length > 0 && (
                  <div className="space-y-0.5" style={{ marginTop: laneCount * laneHeight }}>
                    {dayItems.map((c) => (
                      <CertificationChip key={c.key} item={c} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {weekBars.length > 0 && (
          <div
            className="absolute inset-x-0 grid grid-cols-7 gap-1 pointer-events-none"
            style={{ top: DAY_NUMBER_HEIGHT }}
          >
            {weekBars.map(({ item, startCol, endCol, lane, isTrueStart, isTrueEnd }) => {
              const meta = metaByKey?.[item.key];
              // Amber takes precedence over the course colour: this bar is either an
              // allocation with no names on it or a cycle open to everyone that this
              // battalion has not joined — both are what it is here to act on.
              const awaiting = Boolean(meta?.awaitingNames || meta?.openToAll);
              // Two different offers, two different colours — see OPEN_TO_ALL.
              const tone = meta?.openToAll ? OPEN_TO_ALL : AWAITING_NAMES;
              const oneDay = !isMultiDay(item) && item.kind !== "influencing_factor";
              const className = cn(
                "pointer-events-auto px-1.5 truncate flex items-center gap-1 overflow-hidden shadow-sm",
                awaiting ? "border border-dashed font-semibold" : "text-white",
                isTrueStart ? "rounded-s-sm" : "rounded-s-none",
                isTrueEnd ? "rounded-e-sm" : "rounded-e-none",
                item.kind === "training" &&
                  "outline outline-2 outline-dashed outline-white/70 -outline-offset-2",
                item.kind === "influencing_factor" &&
                  "outline outline-2 outline-dashed outline-white/90 -outline-offset-2",
                oneDay && "text-[11px] px-0.5"
              );
              const style = {
                gridColumnStart: startCol + 1,
                gridColumnEnd: endCol + 2,
                gridRow: 1,
                marginTop: lane * laneHeight,
                height: laneHeight - 3,
                backgroundColor: awaiting ? tone.bg : item.color,
                ...(awaiting ? { color: tone.ink, borderColor: tone.line } : {}),
              } as const;
              const inner = (
                <>
                  {item.kind === "training" && (
                    <GraduationCap className="size-2.5 shrink-0" aria-label="הדרכה" />
                  )}
                  {meta?.fill ? (
                    <span className="flex gap-px shrink-0">
                      <i
                        className="size-1.5 rounded-full border border-white/75 block"
                        style={{ backgroundColor: FILL_DOT[meta.fill] }}
                      />
                      {meta.battalionColor && (
                        <i
                          className="size-1.5 rounded-full border border-white/75 block"
                          style={battalionBarStyle(meta.battalionColor)}
                        />
                      )}
                    </span>
                  ) : (
                    item.battalions.slice(0, 3).map((b) => (
                      <span
                        key={b.code}
                        className="size-1.5 rounded-full border border-white/70 shrink-0"
                        style={battalionBarStyle(b.color_hex)}
                      />
                    ))
                  )}
                  <span className="truncate text-[13px] leading-tight">
                    <span className="font-bold">{item.name}</span>
                    {item.location && (
                      <span className="text-[11px] font-normal opacity-80"> - {item.location}</span>
                    )}
                  </span>
                </>
              );
              if (onBarClick) {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={cn(className, "text-start")}
                    style={style}
                    title={`${item.name}${item.location ? " · " + item.location : ""}`}
                    onClick={() => onBarClick(item)}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={className}
                  style={style}
                  title={`${item.name}${item.location ? " · " + item.location : ""} (${item.start_date}${
                    isMultiDay(item) ? " – " + item.end_date : ""
                  })`}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {showNames && (
        <>
          <div className="col-span-8 h-px bg-border my-1.5" />
          <div className="flex items-center justify-center text-center text-[10px] font-extrabold text-muted-foreground bg-muted rounded-md p-1 leading-tight">
            יוצאים
            <br />
            להסמכה
          </div>
          <div className="col-span-7 grid grid-cols-7 gap-1">
            {week.map((day, i) => {
              const groups = nameGroupsByDay?.[i] ?? [];
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border rounded-md p-1 bg-[#fbfbfc] flex flex-col gap-1.5 min-h-11",
                    weekend(day) && "bg-muted/50",
                    isToday && "border-foreground border-2"
                  )}
                >
                  {groups.length === 0 && (
                    <span className="text-[10px] text-[#b3b9c0] text-center m-auto">—</span>
                  )}
                  {groups.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      className={cn(
                        "flex flex-col gap-0.5 text-start",
                        // Same amber state as the calendar bar above, so one certification
                        // never reads two different ways in the same week.
                        (g.awaitingNames || g.openToAll) &&
                          "rounded-sm border border-dashed p-1 -m-px"
                      )}
                      style={
                        g.awaitingNames || g.openToAll
                          ? {
                              backgroundColor: g.openToAll ? OPEN_TO_ALL.bg : AWAITING_NAMES.bg,
                              borderColor: g.openToAll ? OPEN_TO_ALL.line : AWAITING_NAMES.line,
                            }
                          : undefined
                      }
                      onClick={g.onOpen}
                    >
                      <div
                        className="text-[10px] font-extrabold leading-tight px-0.5 flex items-center justify-between gap-1"
                        style={{
                          color: g.openToAll
                            ? OPEN_TO_ALL.ink
                            : g.awaitingNames
                              ? AWAITING_NAMES.ink
                              : g.color,
                        }}
                      >
                        <span className="truncate">{g.name}</span>
                        {/* No allocation to count against means no "x/y" — showing "3/null"
                            or "3/0" would both read as an over-filled quota. */}
                        {g.allocated !== null && !g.awaitingNames && (
                          <span className="tabular-nums opacity-75 shrink-0">
                            {g.filled}/{g.allocated} שובצו
                          </span>
                        )}
                      </div>
                      {g.awaitingNames ? (
                        <div
                          className="text-[10px] font-bold leading-tight px-0.5"
                          style={{ color: AWAITING_NAMES.ink }}
                        >
                          {AWAITING_NAMES.label}
                          {g.allocated !== null ? ` (${g.allocated})` : ""}
                        </div>
                      ) : (
                        g.slots.map((slot, si) =>
                          slot.name ? (
                            <div
                              key={si}
                              className="text-[10px] font-bold leading-tight rounded-sm px-1 text-white truncate"
                              style={{ backgroundColor: g.color }}
                              title={slot.name}
                            >
                              {slot.name.split(" · ")[0]}
                            </div>
                          ) : (
                            <div
                              key={si}
                              className="text-[10px] font-semibold leading-tight rounded-sm px-1 truncate border border-dashed bg-transparent"
                              style={{ color: g.color, borderColor: "currentColor" }}
                            >
                              מקום פנוי
                            </div>
                          )
                        )
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {empty && (
        <p className="col-span-8 text-center text-sm text-muted-foreground py-2">{emptyWeekMessage}</p>
      )}
    </div>
  );
}

export function WeekdayHeader() {
  return (
    <div className="grid grid-cols-8 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
      <div className="text-primary">שבוע</div>
      {WEEKDAYS.map((d) => (
        <div key={d}>{d}</div>
      ))}
    </div>
  );
}

export { getHebrewWeekdayShort };
