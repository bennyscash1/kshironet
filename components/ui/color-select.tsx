"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact inline color dropdown: a swatch button that opens a grid of palette
 * colors to choose from. RTL-friendly. */
export function ColorSelect({
  value,
  onChange,
  palette,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  palette: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const normalized = (value || "").toLowerCase();

  return (
    <div className="relative w-fit" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 border rounded-md h-9 px-2 bg-background hover:bg-accent transition-colors disabled:opacity-50"
      >
        <span
          className="size-5 rounded-full border shrink-0"
          style={{ backgroundColor: value || "transparent" }}
        />
        <span className="text-xs text-muted-foreground" dir="ltr">
          {value || "—"}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 p-2 rounded-md border bg-popover shadow-md">
          <div className="grid grid-cols-8 gap-1 w-max max-w-[240px]">
            {palette.map((hex) => {
              const selected = hex.toLowerCase() === normalized;
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => {
                    onChange(hex);
                    setOpen(false);
                  }}
                  aria-label={hex}
                  title={hex}
                  className={cn(
                    "size-5 rounded-full border flex items-center justify-center transition-transform hover:scale-110",
                    selected && "ring-2 ring-offset-1 ring-foreground"
                  )}
                  style={{ backgroundColor: hex }}
                >
                  {selected && <Check className="size-3 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
