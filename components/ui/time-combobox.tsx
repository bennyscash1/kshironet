"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** All quarter-hour slots in 24h HH:mm: 00:00, 00:15, … 23:45. */
const QUARTER_HOURS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

/** Parse "H:mm" / "HH:mm" into minutes since midnight, or null if invalid. */
export function timeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Normalize a typed time to zero-padded HH:mm, or null if it isn't a valid time. */
export function normalizeTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function durationHint(minutes: number): string {
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = minutes / 60;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/\.?0+$/, "");
  return `${label} שע׳`;
}

interface TimeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Start time for the end-time field: adds duration hints for later slots. */
  referenceTime?: string;
  id?: string;
  "aria-invalid"?: boolean;
  placeholder?: string;
}

/**
 * Google-Calendar-style time picker: a typeable input that opens a scrollable
 * list of quarter-hour presets (24h HH:mm). Manual entry of any value (even a
 * non-quarter-hour like 14:07) is allowed — the list is a convenience, not a lock.
 */
export function TimeCombobox({
  value,
  onChange,
  referenceTime,
  id,
  placeholder = "--:--",
  ...rest
}: TimeComboboxProps) {
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = useMemo(() => {
    const text = value.trim();
    const filtered = text ? QUARTER_HOURS.filter((t) => t.startsWith(text)) : QUARTER_HOURS;
    const ref = referenceTime ? timeToMinutes(referenceTime) : null;
    return filtered.map((time) => {
      let hint: string | undefined;
      if (ref != null) {
        const diff = timeToMinutes(time)! - ref;
        if (diff > 0) hint = `(${durationHint(diff)})`;
      }
      return { time, hint };
    });
  }, [value, referenceTime]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        className="text-start"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          // Delay so a click on an option registers first.
          blurTimeout.current = setTimeout(() => {
            const normalized = normalizeTime(value);
            if (normalized && normalized !== value) onChange(normalized);
            setOpen(false);
          }, 120);
        }}
        {...rest}
      />
      {open && options.length > 0 && (
        <ul
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          // Keep the input focused while clicking an option.
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((opt) => (
            <li key={opt.time}>
              <button
                type="button"
                dir="ltr"
                onClick={() => {
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  commit(opt.time);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                  opt.time === value && "bg-accent text-accent-foreground"
                )}
              >
                <span>{opt.time}</span>
                {opt.hint && <span className="text-xs text-muted-foreground">{opt.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
