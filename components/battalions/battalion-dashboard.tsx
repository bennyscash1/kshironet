"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addWeeks,
  eachDayOfInterval,
  format,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { RequestStatusBadge } from "@/components/certifications/status-badge";
import { BattalionRosterPanel } from "@/components/battalions/battalion-roster-panel";
import {
  assignLanes,
  AWAITING_NAMES,
  newAllocationForBattalion,
  NEW_BATTALION_ALLOCATION,
  OPEN_TO_ALL,
  WeekRow,
  WeekdayHeader,
  WEEK_LANE_HEIGHT,
  type DayNameGroup,
  type FillDot,
  type WeekBarMeta,
} from "@/components/calendar/week-row";
import type { CalendarItem } from "@/components/calendar/types";
import type { Battalion, BattalionRequest } from "@/lib/types";
import type {
  AdminConfirmationRow,
  BattalionAllocation,
  BattalionDashboardKpis,
  BattalionQuotaUsage,
  BattalionTask,
  QuarterKpi,
} from "@/lib/battalions/types";
import {
  hasUnlimitedSeats,
  openSeatsOf,
  splitByMode,
  type AllocationOpportunity,
} from "@/lib/battalions/allocation-opportunities";
import { openAllocationsOf, urgencyBand } from "@/lib/battalions/open-allocations";
import { UNLIMITED_SEATS } from "@/lib/battalions/action-band";
import { ACTIVE_ROSTER_STATUSES } from "@/lib/utils/slots";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/utils/download-file";
import { isRegistrationLocked } from "@/lib/utils/registration-lock";
import { toast } from "sonner";

const MONTHS = [
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

function quotaOf(a: BattalionAllocation): BattalionQuotaUsage {
  return {
    allocated: a.allocated_slots,
    used: a.registered,
    reserve: a.reserve,
    remaining: a.remaining,
    registration_lock_date: a.registration_lock_date,
    registration_lock_hour: a.registration_lock_hour,
    // The lock now turns on a date AND an hour, so the whole allocation row goes in — the
    // date alone would keep the row reading "open" for up to a day past the closing hour.
    locked: isRegistrationLocked(a),
  };
}

function fillDot(a: BattalionAllocation): FillDot {
  // No quota to fill: the battalion is here because it has soldiers on the certification,
  // so any name at all is the whole story — "full" rather than a phantom shortfall.
  if (a.allocated_slots === null) return a.registered > 0 ? "full" : "none";
  if (a.registered >= a.allocated_slots) return "full";
  if (a.registered === 0) return "none";
  return "part";
}

function countedNames(a: BattalionAllocation): string[] {
  return a.soldiers
    .filter((s) => s.is_reserve === 0 && ACTIVE_ROSTER_STATUSES.includes(s.status))
    .map((s) => `${s.full_name} · ${s.personal_number}`);
}

export function BattalionDashboard({
  battalion,
  summary,
  allocations,
  opportunities,
  tasks,
  adminRows,
  quarter,
  requests,
  calendarItems,
  canEdit,
  scopedCertLinks,
}: {
  battalion: Battalion;
  summary: BattalionDashboardKpis;
  allocations: BattalionAllocation[];
  /**
   * Every open allocation opportunity for this battalion, both modes, already filtered
   * server-side for status, remaining seats and expiry. The band, its counter and the
   * calendar highlight all read THIS array — the client never re-decides eligibility,
   * which is what let the band and the calendar drift apart before.
   */
  opportunities: AllocationOpportunity[];
  tasks: BattalionTask[];
  adminRows: AdminConfirmationRow[];
  quarter: QuarterKpi;
  requests: BattalionRequest[];
  calendarItems: CalendarItem[];
  canEdit: boolean;
  scopedCertLinks: boolean;
}) {
  const router = useRouter();
  const certificationHref = (certificationId: number) =>
    scopedCertLinks
      ? `/battalions/${battalion.code}/certifications/${certificationId}`
      : `/certifications/${certificationId}`;
  const [openId, setOpenId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [exporting, setExporting] = useState(false);

  const open = useMemo(() => openAllocationsOf(allocations), [allocations]);
  const closingSoon = open.filter((a) => a.daysToClose !== null && a.daysToClose <= 3).length;
  const pendingAdmin = adminRows.filter((r) => !r.confirmed_at);
  const over30 = pendingAdmin.filter((r) => r.waiting_days > 30).length;
  const gapTotal = summary.gaps.reduce((s, g) => s + g.gap, 0);

  const byId = useMemo(
    () => new Map(allocations.map((a) => [a.certification_id, a])),
    [allocations]
  );

  function openAlloc(id: number, force = false) {
    setOpenId((prev) => (!force && prev === id ? null : id));
  }

  const week = eachDayOfInterval({ start: weekStart, end: addWeeks(weekStart, 1) }).slice(0, 7);
  const weekEnd = week[6];
  const weekBars = calendarItems;
  const laneOf = useMemo(() => assignLanes(weekBars), [weekBars]);

  // THE CALENDAR READS THE SAME SET AS THE BAND. It used to ask `isAwaitingNames(a)` —
  // "has a quota and nobody named yet" — which is a different question from the band's
  // "seats remain": a quota of 3 with 1 name was listed as open and left unpainted, and
  // neither predicate looked at the date, so an ended cycle stayed highlighted forever.
  const modeByCertId = useMemo(
    () => new Map(opportunities.map((c) => [c.certification_id, c.mode])),
    [opportunities]
  );

  const metaByKey: Record<string, WeekBarMeta> = {};
  for (const item of weekBars) {
    if (item.kind !== "certification") continue;
    const mode = modeByCertId.get(item.id);
    const a = byId.get(item.id);
    if (a) {
      metaByKey[item.key] = {
        fill: fillDot(a),
        battalionColor: battalion.color_hex,
        awaitingNames: mode === "battalion_quota",
        openToAll: mode === "open_to_all",
      };
      continue;
    }
    // An open-to-all cycle has no allocation and no roster row here, so there is no fill to
    // report — a `fillDot` would be the red "אין שמות" dot, saying the battalion is late on
    // seats it was never given. The coloured bar carries the whole message.
    if (mode) {
      metaByKey[item.key] = { openToAll: mode === "open_to_all", awaitingNames: mode === "battalion_quota" };
    }
  }

  const nameGroupsByDay: DayNameGroup[][] = week.map((day) => {
    const iso = format(day, "yyyy-MM-dd");
    return allocations
      .filter((a) => a.start_date.slice(0, 10) === iso)
      .map((a) => {
        const names = countedNames(a);
        // With a quota the row shows every seat, named or empty. Without one there are no
        // seats to show, so it lists exactly the names that exist — a `?? 0` here would
        // silently render nothing for a roster-only certification.
        const slotCount = a.allocated_slots ?? names.length;
        return {
          key: String(a.certification_id),
          name: a.name,
          color: a.color_hex || "#6b7280",
          filled: a.registered,
          allocated: a.allocated_slots,
          // Same source as the bar above it, so one certification cannot read two ways in
          // one week.
          awaitingNames: modeByCertId.get(a.certification_id) === 'battalion_quota',
          openToAll: modeByCertId.get(a.certification_id) === 'open_to_all',
          slots: Array.from({ length: slotCount }, (_, i) => ({
            name: names[i] ?? null,
          })),
          onOpen: () => openAlloc(a.certification_id, true),
        };
      });
  });

  /**
   * Exports the week currently on screen.
   *
   * The bounds are the same `week` array the calendar renders, formatted with date-fns
   * `format` (local, not `toISOString`, which would shift the boundary a day for anyone
   * behind UTC). The server re-runs the same repository query for that range, so the PDF
   * and the screen cannot disagree — and it re-checks authorization there, since a
   * client-supplied battalion id is never trusted.
   */
  async function exportWeek() {
    setExporting(true);
    try {
      const from = format(week[0], "yyyy-MM-dd");
      const to = format(weekEnd, "yyyy-MM-dd");
      const res = await fetch(
        `/api/battalions/${battalion.id}/weekly-export?from=${from}&to=${to}`
      );
      // `res.ok` alone is not enough. An expired session is answered by the proxy with a
      // redirect to /login, which fetch follows transparently — so a failed export arrives
      // as a 200 full of HTML and would be saved as a .pdf the viewer cannot open. Check
      // what actually came back.
      const isPdf = res.headers.get("content-type")?.includes("application/pdf");
      if (!res.ok || !isPdf) {
        toast.error(
          res.status === 401 || res.status === 403 || !isPdf
            ? "ייצוא ההסמכות נכשל — ייתכן שפג תוקף ההתחברות"
            : "ייצוא ההסמכות נכשל"
        );
        return;
      }
      downloadBlob(await res.blob(), `הסמכות_${battalion.name}_${from}.pdf`);
    } catch {
      toast.error("ייצוא ההסמכות נכשל");
    } finally {
      setExporting(false);
    }
  }

  const selected = openId != null ? byId.get(openId) : undefined;

  // Covers BOTH groups; unlimited capacity is rendered as a word rather than a number.
  // Both groups, split from the ONE server-filtered set. `open` above still feeds the KPI
  // delta and the open-tasks list, which are out of this change's scope.
  const { battalionQuota, openToAll } = useMemo(
    () => splitByMode(opportunities),
    [opportunities]
  );
  const bandCertCount = opportunities.length;
  const bandEmpty = bandCertCount === 0;
  // Aggregated across BOTH groups, so the counter cannot disagree with the cards rendered.
  const boundedSeats = openSeatsOf(opportunities);
  const bandSlotsLabel = hasUnlimitedSeats(opportunities)
    ? boundedSeats > 0
      ? `${boundedSeats} + ${UNLIMITED_SEATS}`
      : UNLIMITED_SEATS
    : String(boundedSeats);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <span
              className="w-3.5 h-7 rounded-full shrink-0"
              style={{ backgroundColor: battalion.color_hex }}
            />
            <h1 className="text-2xl font-extrabold" style={{ color: battalion.color_hex }}>
              {battalion.name}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            סיכום גדודי מלא של כלל ההסמכות, הפערים, ההקצאות והמעקב השלישותי.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label='סה"כ פערי הסמכות' value={gapTotal} color="var(--kpi-gap)" />
        <KpiCard
          label="מקומות שהוקצו וממתינים לשמות"
          value={summary.totals.remaining}
          color="var(--kpi-slots)"
          delta={`ב-${open.length} הסמכות${closingSoon ? ` · ${closingSoon} נסגרות תוך 3 ימים` : ""}`}
        />
        <KpiCard
          label="ממתינים לאישור שלישותי"
          value={pendingAdmin.length}
          color="var(--kpi-admin)"
          delta={over30 ? `${over30} מעל 30 יום` : undefined}
        />
        <KpiCard
          label="סיימו הסמכה ברבעון"
          value={quarter.passed}
          color="var(--kpi-quarter)"
          delta={`מתוך ${quarter.registered} שנרשמו`}
        />
      </div>

      {bandEmpty ? (
        // Neutral, NOT the band's own colouring: an empty coloured block reads as "you owe
        // something here" at a glance, which is the opposite of what it means.
        <div className="rounded-[var(--radius)] border bg-card px-4 py-3 text-sm text-muted-foreground">
          אין כרגע הסמכות הממתינות לפעולה מצד הגדוד.
        </div>
      ) : (
        <div
          className="rounded-[var(--radius)] p-4 border-2"
          style={{
            borderColor: "var(--fs-ok-line)",
            backgroundColor: "var(--fs-ok-bg)",
          }}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs font-extrabold rounded-full px-2 py-0.5 border bg-white"
                style={{ borderColor: "var(--fs-ok-line)", color: "var(--fs-ok-ink)" }}
              >
                {bandCertCount} הסמכות · {bandSlotsLabel} מקומות פנויים
              </span>
              <span className="text-xs" style={{ color: "var(--fs-ok-ink)" }}>
                לחיצה על הסמכה פותחת מילוי שמות במקום.
              </span>
            </div>
            <h2 className="text-[1.05rem] font-bold" style={{ color: "var(--fs-ok-ink)" }}>
              הסמכות הממתינות לפעולה
            </h2>
          </div>

          {/* The two kinds of allocation sit SIDE BY SIDE rather than stacked, so neither
              reads as a sub-section of the other — they are two independent offers. Each
              column keeps its own header and its own cards; on a narrow screen they stack,
              because two 218px card columns do not fit. A column with nothing in it is
              dropped entirely rather than left as an empty heading. */}
          <div
            className={cn(
              "grid gap-x-5 gap-y-3 items-start",
              battalionQuota.length > 0 && openToAll.length > 0 && "lg:grid-cols-2"
            )}
          >
          {battalionQuota.length > 0 && (
          <div>
            {/* The battalion's own allocation: seats the brigade set aside for this unit
                and nobody else. The amber and the badge are what make it read first. */}
            <h3
              className="text-[0.8rem] font-extrabold mb-2 flex items-center gap-2 flex-wrap"
              style={{ color: AWAITING_NAMES.ink }}
            >
              <span
                className="rounded-full px-2 py-0.5 text-[0.7rem] border"
                style={{
                  backgroundColor: AWAITING_NAMES.bg,
                  borderColor: AWAITING_NAMES.line,
                }}
              >
                {NEW_BATTALION_ALLOCATION}
              </span>
              {AWAITING_NAMES.label}
            </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(218px,1fr))] gap-2.5">
            {battalionQuota.map((c) => {
              // The inline "fill names" panel needs the full allocation row; the card
              // itself renders from the opportunity, which is what the calendar bar and
              // the counter line also read.
              const a = byId.get(c.certification_id);
              const urg = urgencyBand(c.daysToClose);
              const hot = urg === "hot";
              const seats = c.seats ?? 0;
              return (
                <button
                  key={c.certification_id}
                  type="button"
                  onClick={() => openAlloc(c.certification_id)}
                  className={cn(
                    "rounded-xl p-2.5 flex flex-col gap-2 text-start border-2 transition hover:-translate-y-0.5 hover:shadow-md",
                    openId === c.certification_id && "shadow-lg"
                  )}
                  // A solid amber border rather than the band's green: a targeted
                  // allocation is the loudest thing on this screen and must not blend into
                  // its container.
                  style={{
                    backgroundColor: AWAITING_NAMES.bg,
                    borderColor: hot ? "var(--fs-bad-line)" : AWAITING_NAMES.line,
                  }}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span
                        className="inline-block rounded-full px-1.5 py-0.5 text-[0.6rem] font-extrabold mb-1"
                        style={{ backgroundColor: AWAITING_NAMES.line, color: AWAITING_NAMES.ink }}
                      >
                        {newAllocationForBattalion(battalion.name)}
                      </span>
                      <span className="block text-[0.86rem] font-extrabold leading-tight">{c.name}</span>
                      <span className="block text-[0.66rem] font-semibold text-muted-foreground mt-0.5">
                        {fmt(c.start_date)}
                        {c.location ? ` · ${c.location}` : ""}
                      </span>
                    </span>
                    {c.daysToClose !== null && (
                      <span
                        className={cn(
                          "text-[0.61rem] font-extrabold px-1.5 py-0.5 rounded-full shrink-0",
                          urg === "hot" && "bg-[var(--fs-bad-pill)] text-[var(--fs-bad-ink)]",
                          urg === "warm" && "bg-[#fdf0d8] text-[#8a5a10]",
                          urg === "cool" && "bg-[var(--fs-ok-pill)] text-[var(--fs-ok-ink)]"
                        )}
                      >
                        {c.daysToClose} ימים
                      </span>
                    )}
                  </span>
                  <span className="flex gap-0.5 flex-wrap">
                    {Array.from({ length: seats }, (_, i) => (
                      <b
                        key={i}
                        className={cn(
                          "w-[13px] h-[13px] rounded-[3px] block",
                          i < c.taken
                            ? "bg-[#0f9d6e]"
                            : hot
                              ? "bg-white border-[1.5px] border-[var(--fs-bad-line)]"
                              : "bg-white border-[1.5px] border-dashed border-[#c2c8cf]"
                        )}
                      />
                    ))}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className="text-[0.73rem] font-extrabold tabular-nums"
                      style={{ color: hot ? "var(--fs-bad-ink)" : AWAITING_NAMES.ink }}
                    >
                      {c.taken}/{seats} מולאו · חסרים {c.remaining}
                    </span>
                    <span className="text-[0.66rem] font-extrabold" style={{ color: "#0f7a5c" }}>
                      {openId === c.certification_id && a ? "סגור ▲" : "מלא שמות ▾"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          </div>
          )}

          {openToAll.length > 0 && (
            <div>
              <h3
                className="text-[0.8rem] font-extrabold mb-2 flex items-center gap-2 flex-wrap"
                style={{ color: OPEN_TO_ALL.ink }}
              >
                <span
                  className="rounded-full px-2 py-0.5 text-[0.7rem] border"
                  style={{ backgroundColor: OPEN_TO_ALL.bg, borderColor: OPEN_TO_ALL.line }}
                >
                  {OPEN_TO_ALL.label}
                </span>
                {OPEN_TO_ALL.bandLabel}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(218px,1fr))] gap-2.5">
                {openToAll.map((c) => {
                  const urg = urgencyBand(c.daysToClose);
                  return (
                    <Link
                      key={c.certification_id}
                      href={certificationHref(c.certification_id)}
                      className="rounded-xl p-2.5 flex flex-col gap-2 text-start border-2 border-dashed transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{
                        backgroundColor: OPEN_TO_ALL.bg,
                        borderColor: urg === "hot" ? "var(--fs-bad-line)" : OPEN_TO_ALL.line,
                      }}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span
                            className="inline-block rounded-full px-1.5 py-0.5 text-[0.6rem] font-extrabold mb-1"
                            style={{ backgroundColor: OPEN_TO_ALL.line, color: OPEN_TO_ALL.ink }}
                          >
                            {OPEN_TO_ALL.label}
                          </span>
                          <span className="block text-[0.86rem] font-extrabold leading-tight">
                            {c.name}
                          </span>
                          <span className="block text-[0.66rem] font-semibold text-muted-foreground mt-0.5">
                            {fmt(c.start_date)}
                            {c.location ? ` · ${c.location}` : ""}
                          </span>
                        </span>
                        {c.daysToClose !== null && (
                          <span
                            className={cn(
                              "text-[0.61rem] font-extrabold px-1.5 py-0.5 rounded-full shrink-0",
                              urg === "hot" && "bg-[var(--fs-bad-pill)] text-[var(--fs-bad-ink)]",
                              urg === "warm" && "bg-[#fdf0d8] text-[#8a5a10]",
                              urg === "cool" && "bg-[var(--fs-ok-pill)] text-[var(--fs-ok-ink)]"
                            )}
                          >
                            {c.daysToClose} ימים
                          </span>
                        )}
                      </span>
                      {/* No repeat of the column header's wording here — the badge above
                          already names the offer, and the header states it in full one
                          line up. */}
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className="text-[0.73rem] font-extrabold tabular-nums"
                          style={{ color: OPEN_TO_ALL.ink }}
                        >
                          {/* Unlimited says so in words. A number here would be invented —
                              there is no capacity to subtract from. */}
                          {c.remaining === null
                            ? `מקומות: ${UNLIMITED_SEATS}`
                            : `${c.remaining} מקומות פנויים`}
                        </span>
                        <span
                          className="text-[0.66rem] font-extrabold"
                          style={{ color: "#0f7a5c" }}
                        >
                          פתח ורשום ▾
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          </div>

          {selected && (
            <div className="mt-3 bg-white border-2 rounded-xl p-4" style={{ borderColor: "#0f7a5c" }}>
              <div className="flex items-start justify-between gap-2 flex-wrap pb-3 mb-2 border-b">
                <div>
                  <h3 className="font-bold" style={{ color: selected.color_hex ?? undefined }}>
                    {selected.name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                    {fmt(selected.start_date)}
                    {selected.end_date ? `–${fmt(selected.end_date)}` : ""}
                    {selected.location ? ` · ${selected.location}` : ""}
                    {` · הוקצו ${selected.allocated_slots} מקומות`}
                    {selected.daysToClose !== null
                      ? ` · סגירת רישום בעוד ${selected.daysToClose} ימים`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="xs">
                    <Link href={certificationHref(selected.certification_id)}>פתח את ההסמכה במלואה</Link>
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => setOpenId(null)}>
                    סגור
                  </Button>
                </div>
              </div>
              <BattalionRosterPanel
                battalionId={battalion.id}
                certificationId={selected.certification_id}
                entries={selected.soldiers}
                quota={quotaOf(selected)}
                canEdit={canEdit}
                variant="inline"
                onSaved={() => router.refresh()}
              />
            </div>
          )}
        </div>
      )}

      <div className="rounded-[var(--radius)] border bg-card">
        <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-primary" />
            {/* "הסמכות של" and not "עם הקצאות ל": the list now also covers certifications
                the battalion has soldiers on without a quota row. */}
            <h2 className="font-bold">לוח שנה — הסמכות של {battalion.name}</h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold flex-wrap">
            <Button
              variant="outline"
              size="xs"
              disabled={exporting}
              onClick={exportWeek}
              title="ייצוא הסמכות הגדוד לשבוע המוצג"
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileDown className="size-3.5" />
              )}
              ייצוא ל-PDF
            </Button>
            <span className="rounded-full px-2 py-0.5 border bg-[oklch(0.62_0.16_155_/_0.13)] border-[oklch(0.62_0.16_155_/_0.4)] text-[oklch(0.4_0.13_155)]">
              מולא
            </span>
            <span className="rounded-full px-2 py-0.5 border bg-[oklch(0.76_0.16_70_/_0.16)]">חלקי</span>
            <span className="rounded-full px-2 py-0.5 border bg-[oklch(0.62_0.24_15_/_0.12)]">אין שמות</span>
            {/* The two chips carry exactly the colours the bars are painted with, so the
                legend and the grid cannot disagree about which offer is which. */}
            <span
              className="rounded-full px-2 py-0.5 border"
              style={{
                backgroundColor: AWAITING_NAMES.bg,
                borderColor: AWAITING_NAMES.line,
                color: AWAITING_NAMES.ink,
              }}
            >
              {NEW_BATTALION_ALLOCATION} — {AWAITING_NAMES.label}
            </span>
            <span
              className="rounded-full px-2 py-0.5 border border-dashed"
              style={{
                backgroundColor: OPEN_TO_ALL.bg,
                borderColor: OPEN_TO_ALL.line,
                color: OPEN_TO_ALL.ink,
              }}
            >
              {OPEN_TO_ALL.label}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap border rounded-md px-2.5 py-2">
            <span className="font-extrabold text-[0.95rem]">
              {week[0].getDate()}–{weekEnd.getDate()} ב{MONTHS[weekEnd.getMonth()]} {weekEnd.getFullYear()}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                aria-label="שבוע הבא"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => setWeekStart(subWeeks(weekStart, 1))}
                aria-label="שבוע קודם"
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
              >
                היום
              </Button>
              <input
                type="date"
                className="h-7 text-xs border rounded-md px-1.5 bg-background"
                onChange={(e) => {
                  if (e.target.value) {
                    setWeekStart(startOfWeek(new Date(e.target.value + "T00:00:00"), { weekStartsOn: 0 }));
                  }
                }}
              />
            </div>
          </div>
          <WeekdayHeader />
          <WeekRow
            week={week}
            barItems={weekBars}
            laneOf={laneOf}
            laneHeight={WEEK_LANE_HEIGHT}
            minCellHeight="formula"
            metaByKey={metaByKey}
            nameGroupsByDay={nameGroupsByDay}
            onBarClick={(item) => {
              if (item.kind === "certification") openAlloc(item.id, true);
            }}
            emptyWeekMessage="אין הסמכות לגדוד בשבוע זה."
            alignDayNumber="end"
          />
        </div>
      </div>

      <div className="rounded-[var(--radius)] border bg-card">
        <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-[var(--chart-4)]" />
            <h2 className="font-bold">משימות פתוחות</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold rounded-full px-2 py-0.5 border bg-[oklch(0.76_0.16_70_/_0.16)]">
              {tasks.length} משימות
            </span>
            <Button variant="outline" size="xs" onClick={() => setShowDoneTasks(!showDoneTasks)}>
              {showDoneTasks ? "הסתר שטופלו" : "הצג גם משימות שטופלו"}
            </Button>
          </div>
        </div>
        <div className="px-4 py-2">
          {tasks.length === 0 && (
            <p className="text-sm text-emerald-700 py-3">אין משימות פתוחות כרגע</p>
          )}
          {tasks.map((t, i) => {
            const urg =
              t.days !== null && t.days <= 5 ? "bad" : t.days !== null && t.days <= 12 ? "warn" : "";
            return (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-dashed last:border-0">
                <span
                  className={cn(
                    "w-[26px] h-[26px] rounded-md grid place-items-center text-xs font-extrabold shrink-0",
                    t.kind === "doc" && "bg-[#fdf0d8] text-[#8a5a10]",
                    t.kind === "adm" && "bg-[#ede4fb] text-[#5b21b6]",
                    t.kind === "slot" && "bg-[var(--fs-bad-pill)] text-[var(--fs-bad-ink)]",
                    t.kind === "prq" && "bg-[#dbeafe] text-[#1d4ed8]",
                    t.kind === "pn" && "bg-amber-100 text-amber-900"
                  )}
                >
                  {t.kind === "doc" ? "📄" : t.kind === "adm" ? "✓" : t.kind === "slot" ? "▢" : t.kind === "pn" ? "#" : "!"}
                </span>
                <span className="flex-1 text-[0.83rem] leading-snug">
                  <span className="font-bold">{t.text}</span>
                  <span className="block text-[0.68rem] font-semibold text-muted-foreground">{t.sub}</span>
                </span>
                {urg && (
                  <span
                    className={cn(
                      "text-xs font-semibold rounded-full px-2 py-0.5 border",
                      urg === "bad" && "bg-[oklch(0.62_0.24_15_/_0.12)] text-[oklch(0.45_0.2_15)]",
                      urg === "warn" && "bg-[oklch(0.76_0.16_70_/_0.16)]"
                    )}
                  >
                    {t.days} ימים
                  </span>
                )}
                {t.kind === "slot" && t.certification_id != null ? (
                  <Button size="xs" variant="outline" onClick={() => openAlloc(t.certification_id!, true)}>
                    למלא שמות ‹
                  </Button>
                ) : t.kind === "pn" ? (
                  <Button size="xs" variant="outline" asChild>
                    <Link href="/force-structure/pending-identity">הצג רשימה ‹</Link>
                  </Button>
                ) : t.certification_id != null ? (
                  <Button size="xs" variant="outline" asChild>
                    <Link href={certificationHref(t.certification_id)}>לעמוד ההסמכה ‹</Link>
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[var(--radius)] border bg-card">
        <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-[var(--chart-2)]" />
            <h2 className="font-bold">סיימו הסמכה — לוודא אישור שלישותי</h2>
          </div>
          <span className="text-xs font-semibold rounded-full px-2 py-0.5 border bg-accent">
            {pendingAdmin.length} חיילים
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-[0.78rem]">
                <th className="text-right font-bold px-2.5 py-2 border-b">חייל</th>
                <th className="text-right font-bold px-2.5 py-2 border-b">מ.א.</th>
                <th className="text-right font-bold px-2.5 py-2 border-b">הסמכה</th>
                <th className="text-right font-bold px-2.5 py-2 border-b">סיים</th>
                <th className="text-right font-bold px-2.5 py-2 border-b">ממתין</th>
                <th className="text-right font-bold px-2.5 py-2 border-b">אושר?</th>
              </tr>
            </thead>
            <tbody>
              {adminRows
                .filter((r) => showConfirmed || !r.confirmed_at)
                .map((r) => {
                  const waitCls =
                    r.waiting_days > 30 ? "bad" : r.waiting_days >= 14 ? "warn" : "ok";
                  return (
                    <tr
                      key={r.roster_entry_id}
                      className={cn("border-b last:border-0", r.confirmed_at && "opacity-55")}
                    >
                      <td className="px-2.5 py-2">{r.full_name}</td>
                      <td className="px-2.5 py-2 tabular-nums font-semibold">{r.personal_number}</td>
                      <td className="px-2.5 py-2">{r.certification_name}</td>
                      <td className="px-2.5 py-2 tabular-nums">{r.end_date ? fmt(r.end_date) : "—"}</td>
                      <td className="px-2.5 py-2">
                        {r.confirmed_at ? (
                          <span className="text-xs font-semibold rounded-full px-2 py-0.5 border bg-[oklch(0.62_0.16_155_/_0.13)]">
                            אושר {fmt(r.confirmed_at)}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "text-xs font-semibold rounded-full px-2 py-0.5 border",
                              waitCls === "bad" && "bg-[oklch(0.62_0.24_15_/_0.12)]",
                              waitCls === "warn" && "bg-[oklch(0.76_0.16_70_/_0.16)]",
                              waitCls === "ok" && "bg-[oklch(0.62_0.16_155_/_0.13)]"
                            )}
                          >
                            {r.waiting_days} יום
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        {r.confirmed_at ? (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={!canEdit}
                            onClick={async () => {
                              await fetch(`/api/roster/${r.roster_entry_id}/admin-confirmation`, {
                                method: "DELETE",
                              });
                              router.refresh();
                            }}
                          >
                            בטל אישור
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            disabled={!canEdit}
                            onClick={async () => {
                              await fetch(`/api/roster/${r.roster_entry_id}/admin-confirmation`, {
                                method: "PUT",
                              });
                              router.refresh();
                            }}
                          >
                            סמן כאושר
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {adminRows.filter((r) => showConfirmed || !r.confirmed_at).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground py-6">
                    אין ממתינים לאישור שלישותי.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {adminRows.some((r) => r.confirmed_at) && (
          <div className="px-4 py-2">
            <Button variant="ghost" size="xs" onClick={() => setShowConfirmed(!showConfirmed)}>
              {showConfirmed ? "הסתר מאושרים" : "הצג גם שורות מאושרות"}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius)] border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-4 rounded-full bg-[var(--chart-3)]" />
          <h2 className="font-bold">דרישות פתוחות ופעולות נדרשות</h2>
        </div>
        <div className="space-y-2">
          {requests.map((r) => (
            <Link
              key={r.id}
              href={`/requests/${r.id}`}
              className="flex items-center justify-between gap-2 border rounded-md px-2.5 py-2 text-sm hover:bg-muted/40"
            >
              <span>
                {r.requested_cert_type} · {r.quantity_needed} מקומות
              </span>
              <RequestStatusBadge status={r.status} />
            </Link>
          ))}
          {requests.length === 0 && <p className="text-sm text-muted-foreground">אין דרישות.</p>}
          {canEdit && (
            <Button asChild variant="outline" className="self-start">
              <Link href="/requests/new">+ פתיחת דרישה חדשה</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  const d = iso.slice(0, 10);
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}
