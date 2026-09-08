"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, ChevronLeft, FileDown, Loader2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { battalionBarStyle } from "@/lib/utils/battalion-style";
import { exportElementToSinglePagePdf } from "@/lib/utils/export-pdf";
import type { CalendarItem } from "@/components/calendar/types";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const LABEL_WIDTH = 90;
const DAY_CELL_WIDTH = 22;
const TOTAL_DAY_COLUMNS = 31;
const LANE_HEIGHT = 18;
const CONTENT_ID = "year-gantt-content";
const DAY_COLUMNS_TEMPLATE = `repeat(${TOTAL_DAY_COLUMNS}, ${DAY_CELL_WIDTH}px)`;

interface ItemSpan {
  item: CalendarItem;
  start: Date;
  end: Date;
}

function assignLanes(spans: ItemSpan[]): Map<string, number> {
  // Influencing factors first so they always occupy the top lanes, then by start.
  const sorted = [...spans].sort((a, b) => {
    const pa = a.item.kind === "influencing_factor" ? 0 : 1;
    const pb = b.item.kind === "influencing_factor" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.start.getTime() - b.start.getTime();
  });
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();
  for (const span of sorted) {
    let lane = laneEnds.findIndex((end) => end < span.start.getTime());
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(span.end.getTime());
    } else {
      laneEnds[lane] = span.end.getTime();
    }
    laneOf.set(span.item.key, lane);
  }
  return laneOf;
}

export function YearGanttView({
  items,
  today,
}: {
  items: CalendarItem[];
  /** Today in Asia/Jerusalem. The year view is year-scoped by nature, so it takes only the
   * year from the shared anchor — but it takes it from there rather than from the host
   * clock, so a UTC server and an Israeli client cannot disagree on New Year's Eve. */
  today: Date;
}) {
  const [year, setYear] = useState(() => today.getFullYear());
  const [exporting, setExporting] = useState(false);

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const spans: ItemSpan[] = useMemo(() => {
    return items
      .map((item) => {
        const start = new Date(item.start_date);
        const end = new Date(item.end_date ?? item.start_date);
        return { item, start, end };
      })
      .filter((s) => s.end >= yearStart && s.start <= yearEnd);
  }, [items, year]);

  const laneOf = useMemo(() => assignLanes(spans), [spans]);

  async function exportPdf() {
    setExporting(true);
    try {
      await exportElementToSinglePagePdf(CONTENT_ID, `גאנט_חטיבה_228_${year}.pdf`, { widthMm: 500 });
    } catch (err) {
      console.error("Year Gantt PDF export failed", err);
      toast.error("ייצוא ה-PDF נכשל");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}>
          <ChevronRight className="size-4" />
        </Button>
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg">גאנט {year}</h2>
          <Button onClick={exportPdf} disabled={exporting} size="sm">
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {exporting ? "מכין PDF..." : "ייצוא ל-PDF"}
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}>
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <div id={CONTENT_ID} className="bg-background p-2">
          <div className="flex items-center justify-center gap-2 py-1 bg-primary text-primary-foreground rounded-t-md font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo228.png" alt="חטיבה 228" className="h-6 w-auto" />
            <span>גאנט {year}</span>
          </div>
          {MONTH_NAMES.map((monthName, monthIdx) => {
            const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
            const monthStart = new Date(year, monthIdx, 1);
            const monthEnd = new Date(year, monthIdx, daysInMonth);

            const monthBars = spans
              .map(({ item, start, end }) => {
                if (end < monthStart || start > monthEnd) return null;
                const clippedStart = start < monthStart ? monthStart : start;
                const clippedEnd = end > monthEnd ? monthEnd : end;
                const startCol = clippedStart.getDate() - 1;
                const endCol = clippedEnd.getDate() - 1;
                return {
                  item,
                  startCol,
                  endCol,
                  lane: laneOf.get(item.key) ?? 0,
                  isTrueStart: start >= monthStart,
                  isTrueEnd: end <= monthEnd,
                };
              })
              .filter((b): b is NonNullable<typeof b> => b !== null);

            const laneCount = monthBars.length > 0 ? Math.max(...monthBars.map((b) => b.lane)) + 1 : 0;
            const rowHeight = Math.max(28, laneCount * LANE_HEIGHT + 6);

            return (
              <div key={monthIdx} className="flex border-b last:rounded-b-md">
                <div
                  className="shrink-0 border-e flex items-center justify-center text-xs font-bold bg-muted/50"
                  style={{ width: LABEL_WIDTH }}
                >
                  {monthName}
                </div>
                <div className="relative shrink-0" style={{ minHeight: rowHeight }}>
                  <div
                    className="absolute inset-0 grid"
                    style={{ gridTemplateColumns: DAY_COLUMNS_TEMPLATE }}
                  >
                    {Array.from({ length: TOTAL_DAY_COLUMNS }, (_, i) => {
                      if (i >= daysInMonth) {
                        return <div key={i} className="border-e bg-muted/20" />;
                      }
                      const d = new Date(year, monthIdx, i + 1);
                      const isSaturday = d.getDay() === 6;
                      return (
                        <div
                          key={i}
                          className={cn("border-e text-center text-[9px] text-muted-foreground", isSaturday && "bg-muted/60")}
                        >
                          {i + 1}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="absolute inset-x-0 grid"
                    style={{ gridTemplateColumns: DAY_COLUMNS_TEMPLATE, top: 12 }}
                  >
                    {monthBars.map(({ item, startCol, endCol, lane, isTrueStart, isTrueEnd }) => (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={cn(
                          "text-white text-[10px] px-1 truncate flex items-center gap-0.5 overflow-hidden shadow-sm",
                          isTrueStart ? "rounded-s-sm" : "rounded-s-none",
                          isTrueEnd ? "rounded-e-sm" : "rounded-e-none",
                          item.kind === "training" &&
                            "outline outline-1 outline-dashed outline-white/80 -outline-offset-1"
                        )}
                        style={{
                          gridColumnStart: startCol + 1,
                          gridColumnEnd: endCol + 2,
                          gridRow: 1,
                          marginTop: lane * LANE_HEIGHT,
                          height: LANE_HEIGHT - 3,
                          backgroundColor: item.color,
                        }}
                        title={`${item.name}${item.location ? " · " + item.location : ""} (${item.start_date} – ${item.end_date ?? item.start_date})`}
                      >
                        {item.kind === "training" && (
                          <GraduationCap className="size-2 shrink-0" aria-label="הדרכה" />
                        )}
                        {item.battalions.slice(0, 2).map((b) => (
                          <span
                            key={b.code}
                            className="size-1 rounded-full border border-white/70 shrink-0"
                            style={battalionBarStyle(b.color_hex)}
                          />
                        ))}
                        {endCol - startCol >= 2 && (
                          <span className="truncate">
                            <span className="font-bold">{item.name}</span>
                            {item.location && endCol - startCol >= 6 && (
                              <span className="font-normal opacity-80"> - {item.location}</span>
                            )}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
