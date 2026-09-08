"use client";

import type { Battalion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { battalionBarStyle, battalionChipStyle } from "@/lib/utils/battalion-style";
import { cn } from "@/lib/utils";

export interface CalendarFilters {
  battalionCodes: string[];
  status: string | null;
}

export function FilterBar({
  battalions,
  filters,
  onChange,
}: {
  battalions: Battalion[];
  filters: CalendarFilters;
  onChange: (filters: CalendarFilters) => void;
}) {
  const hasFilter = filters.battalionCodes.length > 0;

  function toggleBattalion(code: string) {
    const active = filters.battalionCodes.includes(code);
    onChange({
      ...filters,
      battalionCodes: active
        ? filters.battalionCodes.filter((c) => c !== code)
        : [...filters.battalionCodes, code],
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">גדוד:</span>
      {battalions.map((b) => {
        const selected = filters.battalionCodes.includes(b.code);
        const emphasized = !hasFilter || selected;
        return (
          <button
            key={b.code}
            onClick={() => toggleBattalion(b.code)}
            className={cn(
              "text-xs font-semibold px-3 py-1 rounded-full border transition-all",
              emphasized ? "text-white border-transparent shadow-sm" : "opacity-50"
            )}
            style={emphasized ? battalionBarStyle(b.color_hex) : battalionChipStyle(b.color_hex)}
          >
            {b.name}
          </button>
        );
      })}
      {hasFilter && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...filters, battalionCodes: [] })}>
          נקה סינון
        </Button>
      )}
    </div>
  );
}
