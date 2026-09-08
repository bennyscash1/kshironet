import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Fully colour-filled KPI square: white centred text, not a white card with a side stripe. */
export function KpiCard({
  label,
  value,
  delta,
  color,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  color: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] px-[0.85rem] py-[0.95rem] text-center flex flex-col items-center justify-center gap-[0.18rem] text-white shadow-[0_2px_8px_rgba(0,0,0,.10)] min-h-[92px]",
        className
      )}
      style={{ backgroundColor: color }}
    >
      <div className="text-[0.78rem] font-bold leading-[1.25] text-white/92">{label}</div>
      <div className="text-[2rem] font-extrabold tabular-nums leading-[1.1] text-white">{value}</div>
      {delta != null && delta !== "" && (
        <div className="text-[0.72rem] font-semibold leading-[1.3] text-white/85">{delta}</div>
      )}
    </div>
  );
}
