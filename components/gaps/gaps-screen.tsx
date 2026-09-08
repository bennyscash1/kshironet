"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  computeGapRow,
  computeRequired,
  familyTotals,
  gapKpis,
  keyText,
  type RequirementKeyLine,
} from "@/lib/gaps/compute";
import type {
  CertificationFamily,
  ComputedGapRow,
  GapKeyLine,
  UnitTypeRow,
} from "@/lib/gaps/types";
import { unitCountsMap, unitNamesMap } from "@/lib/gaps/types";
import type { GapRowNumbers } from "@/lib/gaps/compute";
import type { Battalion } from "@/lib/types";
import type { BattalionAllocation } from "@/lib/battalions/types";
import { openAllocationsOf } from "@/lib/battalions/open-allocations";
import { displayFamilyForGap } from "@/lib/gaps/families";

const SRC: Record<"operational" | "establishment", string> = {
  operational: "צורך מבצעי",
  establishment: "מבנה וארגון לקרב",
};

export function GapsScreen({
  battalion,
  families,
  rows,
  keys,
  units,
  allocations,
  closedThisQuarter,
  canEdit,
}: {
  battalion: Battalion;
  families: CertificationFamily[];
  rows: ComputedGapRow[];
  keys: GapKeyLine[];
  units: UnitTypeRow[];
  allocations: BattalionAllocation[];
  closedThisQuarter: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const counts = unitCountsMap(units);
  const names = unitNamesMap(units);
  const [hiddenFams, setHiddenFams] = useState<Set<number>>(() => new Set());
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [openDetail, setOpenDetail] = useState<number | null>(null);
  const [sort, setSort] = useState<"gap" | "family" | "name">("gap");
  const [draftKeys, setDraftKeys] = useState<Record<number, RequirementKeyLine[]>>({});
  const [draftSource, setDraftSource] = useState<Record<number, "operational" | "establishment">>({});

  const allocatedOpen = openAllocationsOf(allocations).reduce((s, a) => s + a.remaining, 0);

  const numbers = rows.map((r) => {
    const source = draftSource[r.gap_row_id] ?? r.active_source;
    const lines =
      draftKeys[r.gap_row_id] ??
      keys
        .filter((k) => k.gap_row_id === r.gap_row_id && k.source === source)
        .map((k) => ({ qty: k.qty, unitType: k.unit_type }));
    const required = lines.length ? computeRequired(lines, counts) : r.required_count;
    const n = computeGapRow(required, r.held_count);
    const fam = displayFamilyForGap(r.family_id, r.template_domain, families);
    const familyId = fam?.id ?? null;
    return { ...r, ...n, familyId, family_id: familyId, fam, active_source: source, lines };
  });

  const kpis = gapKpis(numbers, { closedThisQuarter, allocatedOpen });
  const famTotals = familyTotals(numbers);

  const ungroupedFam: CertificationFamily = {
    id: -1,
    name: "ללא משפחה",
    ink: "#4b5563",
    line: "#d1d5db",
    bg: "#f4f5f7",
    sort_order: 999,
  };

  const extraFams = new Map<number, CertificationFamily>();
  for (const g of numbers) {
    if (g.fam && !families.some((f) => f.id === g.fam!.id)) extraFams.set(g.fam.id, g.fam);
  }
  const hasUngrouped = numbers.some((g) => g.family_id == null);
  const chipFamilies = [
    ...families,
    ...extraFams.values(),
    ...(hasUngrouped ? [ungroupedFam] : []),
  ];

  const sortRows = (list: typeof numbers) =>
    [...list].sort((a, b) => {
      if (sort === "name") return a.certification_name.localeCompare(b.certification_name, "he");
      return b.gap - a.gap;
    });

  let groups = chipFamilies.map((fam) => ({
    fam,
    list: sortRows(
      numbers.filter((g) => (fam.id === -1 ? g.family_id == null : g.family_id === fam.id))
    ),
  }));

  groups = groups.filter((group) => group.list.length > 0 && !hiddenFams.has(group.fam.id));

  if (sort === "family") {
    groups = [...groups].sort((a, b) => a.fam.name.localeCompare(b.fam.name, "he"));
  } else if (sort === "gap") {
    groups = [...groups].sort(
      (a, b) => b.list.reduce((s, g) => s + g.gap, 0) - a.list.reduce((s, g) => s + g.gap, 0)
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-3.5 h-7 rounded-full shrink-0" style={{ backgroundColor: battalion.color_hex }} />
            <h1 className="text-2xl font-extrabold" style={{ color: battalion.color_hex }}>
              פערים · {battalion.name}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            כל פערי ההסמכה של הגדוד, מקובצים לפי משפחת נושא. ריבוע = מקום נדרש אחד.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="button" variant="outline" disabled title="ייצוא אקסל אינו מחובר במסך זה">
            ייצוא לאקסל
          </Button>
          <Button asChild>
            <Link href="/requests/new">פתח דרישה לפערים המסומנים</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label='סה"כ פער' value={kpis.totalGap} delta="מקומות חסרים" color="var(--kpi-gap)" />
        <KpiCard
          label="מוסמכים מול נדרש"
          value={
            <>
              {kpis.totalHeld}
              <span className="text-[0.9rem] opacity-70">/{kpis.totalRequired}</span>
            </>
          }
          delta={`${kpis.coveragePct}% כיסוי`}
          color="var(--kpi-manned)"
        />
        {kpis.closedThisQuarter !== null && (
          <KpiCard
            label="נסגר הרבעון"
            value={kpis.closedThisQuarter}
            delta="חיילים שסיימו והוסמכו"
            color="#1d7a5e"
          />
        )}
        <KpiCard
          label="צפי לסוף הרבעון"
          value={kpis.projectedEndOfQuarter}
          delta={`אם כל ${allocatedOpen} המקומות שהוקצו יתמלאו`}
          color="var(--kpi-slots)"
        />
      </div>

      <div className="rounded-[var(--radius)] border bg-card p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="famchips">
            {chipFamilies
              .filter((f) =>
                numbers.some((g) => (f.id === -1 ? g.family_id == null : g.family_id === f.id))
              )
              .map((f) => {
              const tot = famTotals.get(f.id === -1 ? null : f.id)?.gap ?? 0;
              const on = !hiddenFams.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={cn("fchip", on && "active")}
                  aria-pressed={on}
                  onClick={() => {
                    const next = new Set(hiddenFams);
                    if (next.has(f.id)) next.delete(f.id);
                    else next.add(f.id);
                    setHiddenFams(next);
                  }}
                >
                  <span className="sw" style={{ background: f.ink }} />
                  {f.name}
                  <b style={{ color: f.ink }}>{tot}</b>
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 items-center text-xs">
            <span className="text-muted-foreground">מיון:</span>
            {(["gap", "family", "name"] as const).map((s) => (
              <Button key={s} size="xs" variant={sort === s ? "default" : "outline"} onClick={() => setSort(s)}>
                {s === "gap" ? "פער יורד" : s === "family" ? "משפחה" : "שם"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {numbers.length === 0 && (
        <div className="rounded-[var(--radius)] border bg-card p-6 text-sm text-muted-foreground">
          אין שורות פער מחושבות לגדוד זה.
        </div>
      )}

      {groups.map((group) => {
        const fam = group.fam;
        const list = group.list;
        const tot = list.reduce((s, g) => s + g.gap, 0);
        return (
          <div key={fam.id}>
            <div className="fam-head">
              <span className="swatch" style={{ background: fam.ink }} />
              <h2 style={{ color: fam.ink }}>{fam.name}</h2>
              <span className="cnt">
                {list.length} הסמכות · פער מצטבר {tot}
              </span>
            </div>
            <div className="gapgrid">
              {list.map((g) => (
                <GapWidget
                  key={g.gap_row_id}
                  g={g}
                  fam={fam}
                  selected={openKey === g.gap_row_id}
                  onOpenKey={() => setOpenKey(openKey === g.gap_row_id ? null : g.gap_row_id)}
                  onOpenDetail={() => setOpenDetail(g.gap_row_id)}
                  names={names}
                  counts={counts}
                />
              ))}
            </div>
            {openKey != null && list.some((g) => g.gap_row_id === openKey) && (
              <KeyEditor
                g={numbers.find((x) => x.gap_row_id === openKey)!}
                units={units}
                counts={counts}
                names={names}
                keys={keys}
                canEdit={canEdit}
                battalionId={battalion.id}
                onClose={() => setOpenKey(null)}
                onDraft={(lines) => setDraftKeys((m) => ({ ...m, [openKey]: lines }))}
                onSource={(src) => setDraftSource((m) => ({ ...m, [openKey]: src }))}
                onSaved={() => router.refresh()}
              />
            )}
          </div>
        );
      })}

      {openDetail != null && (
        <DetailCard
          g={numbers.find((x) => x.gap_row_id === openDetail)!}
          allocations={allocations}
          battalionId={battalion.id}
          canEdit={canEdit}
          onClose={() => setOpenDetail(null)}
        />
      )}

      <div className="gaps-legend rounded-[var(--radius)] border bg-card p-3">
        <span>
          <b>■</b> ריבוע מלא = מקום מאויש ומוסמך
        </span>
        <span>
          <b>□</b> ריבוע ריק = פער
        </span>
        <span style={{ color: "#0f7a5c" }}>
          <b>■</b> ריבוע ירוק כהה = עודף מעל הנדרש
        </span>
        <span>פס צד = פער קריטי (10+)</span>
        <span>לחיצה על ווידג׳ט פותחת את פירוט השיבוץ</span>
      </div>
    </div>
  );
}

function GapWidget({
  g,
  fam,
  selected,
  onOpenKey,
  onOpenDetail,
  names,
  counts,
}: {
  g: ComputedGapRow & { gap: number; surplus: number; required: number; held: number; lines: RequirementKeyLine[] };
  fam: CertificationFamily;
  selected: boolean;
  onOpenKey: () => void;
  onOpenDetail: () => void;
  names: Record<string, string>;
  counts: Record<string, number>;
}) {
  const shown = Math.min(g.required, 60);
  const surplus = g.surplus > 0;
  const balanced = g.gap === 0 && !surplus;
  const cls = cn("gw", selected && "sel", surplus && "surplus", balanced && "balanced", g.gap >= 10 && "crit");
  return (
    <div
      className={cls}
      style={
        {
          "--gc-ink": fam.ink,
          "--gc-line": fam.line,
          "--gc-bg": fam.bg,
        } as React.CSSProperties
      }
      onClick={onOpenDetail}
    >
      <div className="gwtop">
        <div>
          <div className="gwname">{g.certification_name}</div>
          <div className="gwsrc">{SRC[g.active_source]}</div>
        </div>
        <span className="gwgap">
          {surplus ? `עודף +${g.surplus}` : balanced ? "מאוזן" : `פער ${g.gap}`}
        </span>
      </div>
      <div className="sq">
        {Array.from({ length: shown }, (_, i) => (
          <b key={i} className={i < g.held ? "on" : "off"} />
        ))}
        {Array.from({ length: Math.min(g.surplus, 10) }, (_, i) => (
          <b key={`e${i}`} className="extra" />
        ))}
        {g.required > 60 && (
          <span className="text-[0.65rem] text-muted-foreground ms-1">+{g.required - 60}</span>
        )}
      </div>
      <div className="gwnum">
        <span className="big">{g.held}</span>
        <span className="of">מתוך {g.required} נדרשים</span>
      </div>
      <div className="gwbd">
        <b>מפתח:</b> {g.lines.length ? keyText(g.lines, names, counts) : "לא הוגדר מפתח חישוב"}
      </div>
      <div className="gwact" onClick={(e) => e.stopPropagation()}>
        <Button size="xs" variant="outline" onClick={onOpenKey}>
          ⚙ מפתח חישוב
        </Button>
        <Button size="xs" variant={g.gap > 0 ? "default" : "outline"} onClick={onOpenDetail}>
          {g.gap > 0 ? "שבץ שמות" : "פירוט"}
        </Button>
      </div>
    </div>
  );
}

function KeyEditor({
  g,
  units,
  counts,
  names,
  keys,
  canEdit,
  battalionId,
  onClose,
  onDraft,
  onSource,
  onSaved,
}: {
  g: ComputedGapRow & GapRowNumbers & { lines: RequirementKeyLine[]; active_source: "operational" | "establishment" };
  units: UnitTypeRow[];
  counts: Record<string, number>;
  names: Record<string, string>;
  keys: GapKeyLine[];
  canEdit: boolean;
  battalionId: number;
  onClose: () => void;
  onDraft: (lines: RequirementKeyLine[]) => void;
  onSource: (s: "operational" | "establishment") => void;
  onSaved: () => void;
}) {
  const locked = g.active_source === "establishment";
  const estTotal = computeRequired(
    keys.filter((k) => k.gap_row_id === g.gap_row_id && k.source === "establishment").map((k) => ({ qty: k.qty, unitType: k.unit_type })),
    counts
  );
  const opsTotal = computeRequired(
    keys.filter((k) => k.gap_row_id === g.gap_row_id && k.source === "operational").map((k) => ({ qty: k.qty, unitType: k.unit_type })),
    counts
  );

  function updateLine(i: number, patch: Partial<RequirementKeyLine>) {
    const next = g.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    onDraft(next);
  }

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border-2 p-3.5 shadow-lg",
        locked ? "border-[#9aa1a9]" : "border-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b flex-wrap">
        <div>
          <h3 className="font-bold">מפתח חישוב · {g.certification_name}</h3>
          <p className="text-xs text-muted-foreground font-semibold">
            מספר היחידות נלקח אוטומטית מ״שניים לפנים״ בשני המקורות.
          </p>
        </div>
        <Button size="xs" variant="outline" onClick={onClose}>
          סגור
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs font-bold text-muted-foreground">מקור הדרישה:</span>
        {(["establishment", "operational"] as const).map((src) => (
          <Button
            key={src}
            size="xs"
            variant={g.active_source === src ? "default" : "outline"}
            disabled={!canEdit}
            onClick={async () => {
              onSource(src);
              await fetch(`/api/gaps/${g.gap_row_id}/active-source`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ battalion_id: battalionId, source: src }),
              });
              onSaved();
            }}
          >
            {src === "establishment" ? "🔒 " : ""}
            {SRC[src]}
            <span className="ms-1 rounded-full bg-black/10 px-1 tabular-nums">
              {src === "establishment" ? estTotal : opsTotal}
            </span>
          </Button>
        ))}
        {estTotal !== opsTotal && (
          <span className="text-[0.66rem] font-semibold rounded-full px-2 py-0.5 bg-[oklch(0.76_0.16_70_/_0.16)]">
            שני המקורות נותנים מספרים שונים — {estTotal} מול {opsTotal}
          </span>
        )}
      </div>
      {locked && (
        <div className="rounded-md border bg-muted p-2.5 text-xs mb-3">
          🔒 <b>מבנה וארגון לקרב אינו בר שינוי.</b> המפתח נגזר מטבלת התקנים של ״שניים לפנים״. כדי לשנות את
          הדרישה כאן צריך לשנות את המבנה.
          <Button asChild size="xs" variant="outline" className="ms-2">
            <Link href="/force-structure">פתח את ״שניים לפנים״</Link>
          </Button>
        </div>
      )}
      <div className="border rounded-md p-2 space-y-1">
        <div className="grid grid-cols-[74px_26px_1fr_106px_62px_26px] gap-1.5 text-[0.68rem] font-bold text-muted-foreground border-b border-dashed pb-1">
          <span>כמות</span>
          <span />
          <span>יחידה</span>
          <span>במבנה</span>
          <span>סה&quot;כ</span>
          <span />
        </div>
        {g.lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "grid grid-cols-[74px_26px_1fr_106px_62px_26px] gap-1.5 items-center",
              locked && "bg-muted rounded-md px-1"
            )}
          >
            {locked ? (
              <span className="font-extrabold tabular-nums text-center">{line.qty}</span>
            ) : (
              <Input
                type="number"
                min={0}
                className="h-8"
                value={line.qty}
                onChange={(e) => updateLine(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
              />
            )}
            <span className="text-xs text-muted-foreground font-bold">לכל</span>
            {locked ? (
              <span className="font-semibold text-sm">{names[line.unitType] ?? line.unitType}</span>
            ) : (
              <select
                className="h-8 border rounded-md text-sm bg-background"
                value={line.unitType}
                onChange={(e) => updateLine(i, { unitType: e.target.value })}
              >
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs text-muted-foreground font-semibold">
              × <b>{counts[line.unitType] ?? 0}</b> במבנה
            </span>
            <span className="font-extrabold tabular-nums text-primary">
              = {line.qty * (counts[line.unitType] ?? 0)}
            </span>
            {locked ? (
              <span className="text-center opacity-50 text-xs">🔒</span>
            ) : (
              <button
                type="button"
                className="text-muted-foreground hover:text-[var(--fs-bad-ink)]"
                onClick={() => onDraft(g.lines.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {!locked && canEdit && (
          <Button size="xs" variant="outline" className="mt-1" onClick={() => onDraft([...g.lines, { qty: 1, unitType: units[0]?.code ?? "team" }])}>
            + הוסף שורה
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-3 pt-2 border-t">
        <div className="leading-tight">
          <small className="text-[0.63rem] text-muted-foreground font-semibold">נדרש</small>
          <div className="text-xl font-extrabold tabular-nums">{g.required}</div>
        </div>
        <span className="font-extrabold text-muted-foreground">−</span>
        <div className="leading-tight">
          <small className="text-[0.63rem] text-muted-foreground font-semibold">מוסמכים · מ״שניים לפנים״</small>
          <div className="text-xl font-extrabold tabular-nums">{g.held}</div>
        </div>
        <span className="font-extrabold text-muted-foreground">=</span>
        <div className="leading-tight">
          <small className="text-[0.63rem] text-muted-foreground font-semibold">{g.surplus > 0 ? "עודף" : "פער"}</small>
          <div
            className="text-xl font-extrabold tabular-nums"
            style={{ color: g.surplus > 0 || g.gap === 0 ? "var(--fs-ok-ink)" : "var(--fs-bad-ink)" }}
          >
            {g.surplus > 0 ? `+${g.surplus}` : g.gap}
          </div>
        </div>
        <span className="ms-auto">
          {locked ? (
            <span className="text-xs rounded-full border px-2 py-0.5">קריאה בלבד</span>
          ) : (
            <Button
              size="xs"
              disabled={!canEdit}
              onClick={async () => {
                await fetch(`/api/gaps/${g.gap_row_id}/key`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ battalion_id: battalionId, lines: g.lines }),
                });
                onSaved();
              }}
            >
              שמור מפתח
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}

function DetailCard({
  g,
  allocations,
  battalionId: _battalionId,
  canEdit: _canEdit,
  onClose,
}: {
  g: ComputedGapRow & { gap: number; required: number; held: number };
  allocations: BattalionAllocation[];
  battalionId: number;
  canEdit: boolean;
  onClose: () => void;
}) {
  void _battalionId;
  void _canEdit;
  const upcoming = allocations
    .filter((a) => a.name === g.certification_name || a.name.includes(g.certification_name))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  return (
    <details open className="gapdetail">
      <summary>
        <span className="text-xs font-extrabold rounded-full px-2 py-0.5 bg-[var(--fs-bad-pill)] text-[var(--fs-bad-ink)]">
          פער {g.gap}
        </span>
        {g.certification_name}
        <span className="font-normal text-muted-foreground text-xs">
          · {g.held} מתוך {g.required}
          {upcoming ? ` · ${upcoming.allocated_slots} מקומות הוקצו · ${upcoming.registered} שמות מלאו` : ""}
        </span>
        <Button size="xs" variant="ghost" className="ms-auto" onClick={onClose}>
          סגור
        </Button>
      </summary>
      <div className="p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-md bg-muted p-3 text-sm">
            <b>מקור הדרישה</b>
            <ul className="mt-1 list-disc ps-4">
              <li>
                {SRC[g.active_source]}: {g.required} מוסמכים
              </li>
            </ul>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <b>ההסמכה הקרובה</b>
            {upcoming ? (
              <ul className="mt-1 list-disc ps-4">
                <li>
                  {upcoming.start_date.slice(8, 10)}/{upcoming.start_date.slice(5, 7)}
                  {upcoming.location ? ` · ${upcoming.location}` : ""}
                </li>
                <li>הוקצו לגדוד: {upcoming.allocated_slots} מקומות</li>
                <li>מולאו {upcoming.registered} מתוך {upcoming.allocated_slots}</li>
              </ul>
            ) : (
              <p className="text-muted-foreground mt-1">אין הסמכה קרובה עם הקצאה.</p>
            )}
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <b>פעולות</b>
            <div className="flex flex-wrap gap-1 mt-2">
              <Button size="xs" asChild>
                <Link href="/requests/new">פתח דרישה</Link>
              </Button>
              {upcoming && (
                <Button size="xs" variant="outline" asChild>
                  <Link href={`/force-structure`}>שבץ מ״שניים לפנים״</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          שמירת מועמד נעשית בטבלת המועמדים ואינה יוצרת רשומת רוסטר. שליחה לרישום היא פעולה נפרדת דרך
          טופס החייל בהסמכה.
        </p>
      </div>
    </details>
  );
}
