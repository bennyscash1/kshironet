"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { SoldierLookupRow } from "@/lib/force-structure/types";

export function SoldierSearch({
  battalionId,
  onPick,
  onFreeText,
}: {
  battalionId: number;
  onPick: (row: SoldierLookupRow) => void;
  onFreeText: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SoldierLookupRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setHits([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(
        `/api/force-structure/soldiers?battalionId=${battalionId}&q=${encodeURIComponent(t)}`
      );
      if (!res.ok) return;
      setHits((await res.json()) as SoldierLookupRow[]);
      setOpen(true);
    }, 200);
    return () => clearTimeout(handle);
  }, [q, battalionId]);

  return (
    <div className="relative">
      <Input
        value={q}
        placeholder="שם מלא או מספר אישי…"
        onChange={(e) => {
          setQ(e.target.value);
          onFreeText(e.target.value);
        }}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border bg-card shadow-md max-h-56 overflow-auto text-sm">
          {hits.map((h) => (
            <li key={`${h.source}-${h.assignment_id ?? h.bank_id}`}>
              <button
                type="button"
                className="w-full text-start px-3 py-2 hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQ(`${h.full_name} · ${h.personal_number}`);
                  setOpen(false);
                  onPick(h);
                }}
              >
                <div className="font-semibold">
                  {h.full_name} · {h.personal_number}
                </div>
                <div className="text-xs text-muted-foreground">{h.frame}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
