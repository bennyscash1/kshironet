"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { battalionBadgeStyle } from "@/lib/utils/battalion-style";
import type {
  GapBattalionGroup,
  GapRequestTypeGroup,
} from "@/lib/gaps/groupings";

/** Which grouping of the gap data is on screen. Client-only: never in the URL, never
 * persisted — a reload always comes back on "לפי גדוד". */
export type GapTab = "battalion" | "requestType";

interface GapTabState {
  tab: GapTab;
  setTab: (tab: GapTab) => void;
}

const GapTabContext = createContext<GapTabState | null>(null);

/**
 * Shares the active tab with the export buttons, which sit above this section in the page
 * and therefore cannot receive it as a prop. The Excel export reads it to decide which
 * grouping to write; the PDF export needs nothing, because Radix unmounts the inactive
 * panel, so a DOM capture already contains exactly the visible grouping.
 */
export function GapTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<GapTab>("battalion");
  const value = useMemo(() => ({ tab, setTab }), [tab]);
  return <GapTabContext.Provider value={value}>{children}</GapTabContext.Provider>;
}

export function useGapTab(): GapTabState {
  const ctx = useContext(GapTabContext);
  if (!ctx) throw new Error("useGapTab must be used inside <GapTabProvider>");
  return ctx;
}

const BADGE_CLASS =
  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums bg-[var(--badge-bg)] text-[var(--badge-fg)] dark:text-[var(--badge-fg-dark)]";

function EmptyState() {
  return (
    <div data-pdf-atomic className="rounded-lg border p-8 text-center text-muted-foreground">
      אין דרישות פתוחות להצגה
    </div>
  );
}

function BattalionCards({ groups }: { groups: GapBattalionGroup[] }) {
  if (groups.length === 0) return <EmptyState />;
  return (
    // The grid is one PDF block: side-by-side cards only survive the export if they are
    // captured together, and at most six battalions fit comfortably on a page.
    <div
      data-pdf-atomic
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
    >
      {groups.map((group) => (
        <div key={group.battalion_id} className="rounded-lg border bg-card shadow-sm">
          <div
            className="flex items-center justify-between gap-2 p-3"
            style={battalionBadgeStyle(group.battalion_color)}
          >
            {/* The battalion's own colour, darkened/lightened per theme — several of the
                raw hexes are too light to read as text on the card background. */}
            <span className="font-bold text-[var(--badge-fg)] dark:text-[var(--badge-fg-dark)]">
              {group.battalion_name}
            </span>
            <span className={BADGE_CLASS}>{group.total} סה״כ</span>
          </div>
          <div className="border-t divide-y">
            {group.entries.map((entry) => (
              <div
                key={entry.request_type_id}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">{entry.request_type_name}</span>
                <span className="font-semibold tabular-nums">{entry.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestTypeCards({ groups }: { groups: GapRequestTypeGroup[] }) {
  if (groups.length === 0) return <EmptyState />;
  return (
    // Stacked full-width cards, so each is its own PDF block and the list paginates
    // without a card ever being split across two pages.
    <div className="space-y-3">
      {groups.map((group) => (
        <div
          key={group.request_type_id}
          data-pdf-atomic
          className="rounded-lg border bg-card shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="font-bold">{group.request_type_name}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums">
              {group.total} סה״כ
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 border-t p-3">
            {group.entries.map((entry) => (
              <span
                key={entry.battalion_id}
                className={BADGE_CLASS}
                style={battalionBadgeStyle(entry.battalion_color)}
              >
                {entry.battalion_name} · {entry.quantity}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The two groupings of "פערי הסמכות ביחס לשיבוץ", replacing the old certification ×
 * battalion matrix. Both shapes are folded server-side from a single query, so switching
 * tabs is pure client state and fetches nothing.
 */
export function GapGroupsTabs({
  byBattalion,
  byRequestType,
}: {
  byBattalion: GapBattalionGroup[];
  byRequestType: GapRequestTypeGroup[];
}) {
  const { tab, setTab } = useGapTab();

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as GapTab)}>
      <TabsList className="no-print">
        <TabsTrigger value="battalion">לפי גדוד</TabsTrigger>
        <TabsTrigger value="requestType">לפי סוג דרישה</TabsTrigger>
      </TabsList>
      {tab === "battalion" ? (
        <BattalionCards groups={byBattalion} />
      ) : (
        <RequestTypeCards groups={byRequestType} />
      )}
    </Tabs>
  );
}
