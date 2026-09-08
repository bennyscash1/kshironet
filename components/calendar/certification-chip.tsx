"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { CertificationStatusBadge } from "@/components/certifications/status-badge";
import type { CalendarItem } from "@/components/calendar/types";
import { battalionBarStyle } from "@/lib/utils/battalion-style";
import { cn } from "@/lib/utils";

/** Dashed outline marking training-sourced events. `outline` (not `border`) so it
 * never changes the bar's box size/alignment; inset offset keeps it inside the
 * rounded bar and visible against the fill color. */
const TRAINING_OUTLINE = "outline outline-2 outline-dashed outline-white/70 -outline-offset-2";

export function CertificationChip({ item }: { item: CalendarItem }) {
  const isTraining = item.kind === "training";
  return (
    <Link
      href={item.href}
      className={cn(
        "block rounded px-1.5 py-1 text-white overflow-hidden shadow-sm hover:shadow-md transition-shadow",
        isTraining && TRAINING_OUTLINE
      )}
      // Single-day events use the exact same color source as multi-day bars.
      style={{ backgroundColor: item.color || "var(--muted-foreground)" }}
      title={`${item.name}${item.location ? " · " + item.location : ""}`}
    >
      <div className="flex items-center gap-1">
        <div className="flex -space-x-0.5 shrink-0">
          {item.battalions.length > 0 ? (
            item.battalions.slice(0, 3).map((b) => (
              <span
                key={b.code}
                className="size-2 rounded-full border border-white/80"
                style={battalionBarStyle(b.color_hex)}
                title={b.name}
              />
            ))
          ) : (
            <span className="size-2 rounded-full bg-white/50" title="כלל החטיבה" />
          )}
        </div>
        {isTraining && (
          <GraduationCap className="size-3 shrink-0" aria-label="הדרכה" />
        )}
        {/* Name + unit on a single line: the unit is smaller/lighter inline, and the
            whole line truncates with an ellipsis instead of wrapping onto a 2nd row.
            Matches the inline layout of the multi-day spanning bars. */}
        <span className="truncate min-w-0 text-[13px] leading-tight">
          <span className="font-semibold">{item.name}</span>
          {item.location && (
            <span className="text-[11px] font-normal opacity-80"> - {item.location}</span>
          )}
        </span>
      </div>
    </Link>
  );
}

export function CertificationChipDetailed({ item }: { item: CalendarItem }) {
  const isTraining = item.kind === "training";
  return (
    <Link
      href={item.href}
      className={cn(
        "block rounded-md border bg-card p-2 hover:shadow-md transition-shadow border-e-4",
        isTraining && "border-dashed"
      )}
      style={{ borderInlineEndColor: item.color ?? "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm truncate flex items-center gap-1">
          {isTraining && (
            <GraduationCap className="size-3.5 shrink-0 text-muted-foreground" aria-label="הדרכה" />
          )}
          {item.name}
        </span>
        {item.kind === "certification" && item.status ? (
          <CertificationStatusBadge status={item.status} />
        ) : (
          <span className="text-[11px] text-muted-foreground shrink-0">
            {item.kind === "influencing_factor" ? "גורם משפיע" : "הדרכה"}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
        <span>{item.location ?? "ללא מיקום"}</span>
        {item.kind === "certification" && item.registered_count !== undefined && (
          <span>
            {item.registered_count}
            {item.slots_remaining !== null && item.slots_remaining !== undefined
              ? ` / ${item.total_slots}`
              : ""}{" "}
            רשומים
          </span>
        )}
      </div>
      {item.battalions.length > 0 && (
        <div className="flex gap-1 mt-1">
          {item.battalions.map((b) => (
            <span
              key={b.code}
              className="size-2 rounded-full"
              style={battalionBarStyle(b.color_hex)}
              title={b.name}
            />
          ))}
        </div>
      )}
    </Link>
  );
}
