"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FilterBar, type CalendarFilters } from "@/components/calendar/filter-bar";
import { MonthView } from "@/components/calendar/month-view";
import { GanttView } from "@/components/calendar/gantt-view";
import { YearGanttView } from "@/components/calendar/year-gantt-view";
import { AgendaView } from "@/components/calendar/agenda-view";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { canEdit } from "@/lib/auth/permissions";
import {
  appTodayIso,
  civilDate,
  isSameCalendarWeek,
  resolveAnchorIso,
} from "@/lib/calendar/anchor";
import type { Battalion } from "@/lib/types";
import type { CalendarItem } from "@/components/calendar/types";

type ViewMode = "month" | "gantt" | "year" | "agenda";

export function CalendarClient({
  items,
  battalions,
  todayIso,
}: {
  items: CalendarItem[];
  battalions: Battalion[];
  /** Today in Asia/Jerusalem, resolved on the server. Passing it down rather than calling
   * `new Date()` here is what makes the server's HTML and the client's first render agree
   * — these are client components, so both run this code. */
  todayIso: string;
}) {
  const searchParams = useSearchParams();
  const urlDate = searchParams.get("date");

  const [view, setView] = useState<ViewMode>("month");
  const [filters, setFilters] = useState<CalendarFilters>({ battalionCodes: [], status: null });
  const { user } = useCurrentUser();

  // THE SINGLE ANCHOR. Every view reads it; none computes its own starting point any more,
  // which is why switching views keeps the current week in sight. Seeded from the server's
  // value so hydration matches; an explicit ?date= wins, and nothing is persisted, so a new
  // session always opens on the current week.
  const [anchorIso, setAnchorIso] = useState(() => resolveAnchorIso(urlDate, todayIso));
  // The page is `force-dynamic`, so the server's value is computed fresh on every entry and
  // is already Asia/Jerusalem-correct — no client correction is needed on load, and not
  // doing one is what keeps the first client render byte-identical to the server's.
  // The only drift left is a tab held open across midnight, which `goToToday` re-reads.
  const [clientTodayIso, setClientTodayIso] = useState(todayIso);

  function goToToday() {
    const actual = appTodayIso();
    setClientTodayIso(actual);
    setAnchorIso(actual);
  }

  const today = useMemo(() => civilDate(clientTodayIso) as Date, [clientTodayIso]);
  const anchor = useMemo(() => civilDate(anchorIso) ?? today, [anchorIso, today]);
  const onCurrentWeek = isSameCalendarWeek(anchor, today);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 768) setView((v) => (v === "gantt" || v === "year" ? "agenda" : v));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filtered = useMemo(() => {
    if (filters.battalionCodes.length === 0) return items;
    return items.filter(
      (item) =>
        item.battalions.some((b) => filters.battalionCodes.includes(b.code)) ||
        (item.registration_open === 1 && item.battalions.length === 0)
    );
  }, [items, filters]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <FilterBar battalions={battalions} filters={filters} onChange={setFilters} />
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit(user) && (
            <Button asChild size="sm">
              <Link href="/influencing-factors/new">
                <Plus className="size-4" />
                הוספת גורם משפיע
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            // Returns every view to the current week — the anchor is shared, so one button
            // is enough and the three views cannot disagree about where "today" is.
            onClick={goToToday}
            disabled={onCurrentWeek}
            title="חזרה לשבוע הנוכחי"
          >
            <CalendarDays className="size-4" />
            היום
          </Button>
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month">חודשי</TabsTrigger>
              <TabsTrigger value="gantt" className="hidden md:inline-flex">
                גאנט
              </TabsTrigger>
              <TabsTrigger value="year" className="hidden md:inline-flex">
                שנתי
              </TabsTrigger>
              <TabsTrigger value="agenda">רשימה</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {view === "month" && (
        <MonthView items={filtered} anchor={anchor} today={today} onAnchorChange={setAnchorIso} />
      )}
      {view === "gantt" && <GanttView items={filtered} today={today} />}
      {view === "year" && <YearGanttView items={filtered} today={today} />}
      {view === "agenda" && <AgendaView items={filtered} anchor={anchor} today={today} />}
    </div>
  );
}
