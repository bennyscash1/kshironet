"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { computeCompanyKpis, requirementsOf, type RoleStatus } from "@/lib/force-structure/status";
import type {
  BankSoldierRow,
  CanvasRoleRow,
  CompanyKpiRow,
} from "@/lib/force-structure/types";
import type { Battalion } from "@/lib/types";

function statusesFrom(row: {
  manned_posts: number;
  certification_gap: number;
  pending_identity: number;
  manpower_gap: number;
}): RoleStatus[] {
  const ok = row.manned_posts - row.certification_gap - row.pending_identity;
  return [
    ...Array<RoleStatus>(Math.max(ok, 0)).fill("ok"),
    ...Array<RoleStatus>(row.certification_gap).fill("red"),
    ...Array<RoleStatus>(row.pending_identity).fill("pending"),
    ...Array<RoleStatus>(row.manpower_gap).fill("empty"),
  ];
}

type ViewMode = "canvas" | "table" | "gaps";
type Filter = "all" | "empty" | "red";
type Picked =
  | { from: "role"; assignmentId: number; roleId: number }
  | { from: "bank"; bankId: number }
  | null;

export function ForceStructureScreen({
  battalion,
  companies,
  roles,
  bank,
  pendingCount,
  canEdit,
}: {
  battalion: Battalion;
  companies: CompanyKpiRow[];
  roles: CanvasRoleRow[];
  bank: BankSoldierRow[];
  pendingCount: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.company_id ?? 0);
  const [dept, setDept] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("canvas");
  const [filter, setFilter] = useState<Filter>("all");
  const [editMode, setEditMode] = useState(false);
  const [picked, setPicked] = useState<Picked>(null);
  // The open edit session's snapshot id. Null outside edit mode. The snapshot itself lives
  // on the server — this is only the handle to it.
  const [sessionId, setSessionId] = useState<number | null>(null);
  // Whether this session has committed anything yet. Drives the confirmation: backing out
  // of an untouched session has nothing to warn about.
  const [dirty, setDirty] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bankOpen, setBankOpen] = useState(true);
  const [xferOpen, setXferOpen] = useState(false);
  const [dropRole, setDropRole] = useState<number | null>(null);
  const [dropBank, setDropBank] = useState(false);

  const company = companies.find((c) => c.company_id === companyId) ?? companies[0];
  const companyRoles = roles.filter((r) => r.company_id === company?.company_id);
  const departments = useMemo(() => {
    const seen: string[] = [];
    for (const r of companyRoles) {
      if (!seen.includes(r.department)) seen.push(r.department);
    }
    return seen;
  }, [companyRoles]);

  const activeDept = dept && departments.includes(dept) ? dept : departments[0] ?? "";
  const deptRoles = companyRoles.filter((r) => r.department === activeDept);

  const kpis = company
    ? computeCompanyKpis(statusesFrom(company), company.bank_count)
    : computeCompanyKpis([]);

  const filtered = deptRoles.filter((r) => {
    if (filter === "empty") return r.status === "empty";
    if (filter === "red") return r.status === "red";
    return true;
  });

  const viewRoles = view === "gaps" ? filtered.filter((r) => r.status !== "ok") : filtered;
  const establishment = company?.establishment ?? 0;
  const cap = Math.round(establishment * 1.2);
  const actual = (company?.manned_posts ?? 0) + (company?.bank_count ?? 0);
  const pct = establishment === 0 ? 0 : Math.round((actual / establishment) * 100);
  const overCap = actual > cap;

  const companyBank = bank.filter((b) => b.company_id === company?.company_id);

  async function moveRole(assignmentId: number, target: { kind: "role"; role_id: number } | { kind: "bank" }) {
    const res = await fetch(
      `/api/force-structure/assignments/${assignmentId}/move?battalionId=${battalion.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      }
    );
    if (res.ok) {
      setDirty(true);
      router.refresh();
    }
  }

  async function moveBank(bankId: number, roleId: number) {
    const res = await fetch(`/api/force-structure/bank/${bankId}/move?battalionId=${battalion.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId }),
    });
    if (res.ok) {
      setDirty(true);
      router.refresh();
    }
  }

  // --- edit session ---------------------------------------------------------
  //
  // Every move above commits the moment it is made, so "מצב עריכה" is not a draft: there is
  // no local copy of the occupancy to throw away. The session endpoints exist for exactly
  // that reason — the server snapshots the people layer when edit mode opens, and "חזור"
  // asks it to write that snapshot back.

  /** Leaves edit mode locally. Shared by both exits, after each has done its own work. */
  function leaveEditMode() {
    setEditMode(false);
    setPicked(null);
    setSessionId(null);
    setDirty(false);
  }

  async function enterEditMode() {
    setBusy(true);
    try {
      const res = await fetch(`/api/force-structure/edit-session?battalionId=${battalion.id}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("open failed");
      const data: { snapshot_id: number } = await res.json();
      setSessionId(data.snapshot_id);
      setDirty(false);
      setPicked(null);
      setEditMode(true);
    } catch {
      // Refusing to open is the honest failure. Entering without a snapshot would mean
      // entering with no way back — the first drag would already be in the database — and a
      // "חזור" that silently cannot revert is worse than no "חזור" at all.
      toast.error("לא ניתן לפתוח מצב עריכה כרגע. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  /** "סיום עריכה" — keeps everything. The moves are already saved; this drops the snapshot. */
  function finishEditing() {
    const id = sessionId;
    leaveEditMode();
    if (id !== null) {
      // Not awaited and its failure not surfaced: the edits are kept either way, and the
      // next time this user opens a session the stale snapshot is cleared server-side.
      void fetch(`/api/force-structure/edit-session/${id}?battalionId=${battalion.id}`, {
        method: "DELETE",
      });
    }
  }

  /** "חזור" — asks first if there is anything to lose, then reverts. */
  function requestCancel() {
    if (!dirty) {
      finishEditing();
      return;
    }
    setConfirmCancel(true);
  }

  async function confirmCancelEditing() {
    const id = sessionId;
    if (id === null) {
      setConfirmCancel(false);
      leaveEditMode();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/force-structure/edit-session/${id}/revert?battalionId=${battalion.id}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("revert failed");
      setConfirmCancel(false);
      leaveEditMode();
      toast.success("השינויים בוטלו");
      router.refresh();
    } catch {
      // Stay in edit mode rather than dropping the user out believing their changes were
      // undone. Refresh anyway: if the request itself timed out, the transaction's fate is
      // not ours to know, so the screen must show what the server actually holds.
      toast.error("ביטול השינויים נכשל. רענן ובדוק את המצבה לפני שתמשיך.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function onCardClick(r: CanvasRoleRow) {
    if (!editMode) return;
    if (picked) {
      if (picked.from === "role") {
        void moveRole(picked.assignmentId, { kind: "role", role_id: r.role_id });
      } else {
        void moveBank(picked.bankId, r.role_id);
      }
      setPicked(null);
      return;
    }
    if (r.assignment_id) setPicked({ from: "role", assignmentId: r.assignment_id, roleId: r.role_id });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-3.5 h-7 rounded-full shrink-0" style={{ backgroundColor: battalion.color_hex }} />
          <div>
            <h1 className="text-2xl font-extrabold" style={{ color: battalion.color_hex }}>
              שניים לפנים · {battalion.name}
            </h1>
            <p className="text-sm text-muted-foreground">מבנה כוח ואיוש תקנים ברמת הפלוגה.</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit &&
            (editMode ? (
              <>
                <Button variant="default" disabled={busy} onClick={finishEditing}>
                  ✓ סיום עריכה
                </Button>
                <Button variant="outline" disabled={busy} onClick={requestCancel}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  ↩ חזור
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => void enterEditMode()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                ✎ מצב עריכה
              </Button>
            ))}
        </div>
      </div>

      <div className="rounded-[var(--radius)] border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold space-y-1">
            <span className="text-muted-foreground">פלוגה</span>
            <select
              className="w-full h-9 border rounded-md px-2 bg-background"
              value={company?.company_id}
              onChange={(e) => {
                setCompanyId(Number(e.target.value));
                setDept(null);
                setPicked(null);
              }}
            >
              {companies.map((c) => (
                <option key={c.company_id} value={c.company_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm font-semibold space-y-1">
            <span className="text-muted-foreground">תצוגה</span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["canvas", "קנבס תפקידים"],
                  ["table", "טבלה"],
                  ["gaps", "חוסרים בלבד"],
                ] as const
              ).map(([id, label]) => (
                <Button key={id} size="xs" variant={view === id ? "default" : "outline"} onClick={() => setView(id)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="text-sm font-semibold space-y-1">
            <span className="text-muted-foreground">סינון</span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "הכל"],
                  ["empty", "תקנים ריקים"],
                  ["red", "חסרי הסמכה"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="xs"
                  variant={filter === id ? "default" : "outline"}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="מוכנות" value={`${kpis.readinessPct}%`} delta="מאויש מתוך התקן" color="var(--kpi-ready)" />
        <KpiCard
          label="מאויש"
          value={
            <>
              {kpis.manned}
              <span className="text-[0.9rem] opacity-70">/{kpis.establishment}</span>
            </>
          }
          delta={`${kpis.mannedPosts} בתקן + ${kpis.bank} בבנק`}
          color="var(--kpi-manned)"
        />
        <KpiCard
          label="פערי הסמכה"
          value={kpis.certificationGap}
          delta="מאויש ללא הסמכה"
          color="var(--kpi-gap)"
        />
        <KpiCard label='פער כ"א' value={kpis.manpowerGap} delta="תקנים ריקים" color="var(--kpi-slots)" />
      </div>
      <p className="text-xs text-muted-foreground">
        מוכנות = מאוישים / תקן, כפי שמחושב בגיליון הגדוד. פערי הסמכה ופער כ&quot;א נמדדים בנפרד ואינם
        מסוכמים יחד — תקן ריק דורש אדם, ותקן מאויש ללא הסמכה דורש קורס.
      </p>

      {pendingCount > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <Link href="/force-structure/pending-identity" className="font-semibold underline">
            {pendingCount} חיילים ממתינים למספר אישי
          </Link>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {departments.map((d) => {
          const rs = companyRoles.filter((r) => r.department === d);
          const manned = rs.filter((r) => r.is_manned).length;
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDept(d);
                setPicked(null);
              }}
              className={cn(
                "font-bold text-[0.82rem] border-[1.5px] rounded-md px-3 py-1.5 flex items-center gap-1.5",
                d === activeDept
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary"
              )}
            >
              {d}
              <span className="text-[0.68rem] font-bold opacity-70 tabular-nums">
                {manned}/{rs.length}
              </span>
            </button>
          );
        })}
      </div>

      {editMode && (
        <div className="rounded-md border-[1.5px] border-primary/35 bg-accent px-3 py-2.5 text-sm">
          <b>מצב עריכה פעיל.</b> גרור חייל לתקן אחר כדי לשבץ או להחליף, או אל הבנק כדי להוציא מהמצבה.
          אפשר גם ללחוץ כדי להרים ואז ללחוץ על היעד. 🔒 התפקידים קבועים — רק החייל זז.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_274px] items-start">
        <div className="space-y-4">
          {deptRoles.length === 0 ? (
            <div className="rounded-[var(--radius)] border bg-muted/30 p-6 text-sm text-muted-foreground">
              אין תקנים מוגדרים למחלקה זו בפלוגה. יש להריץ את הייבוא מטבלת הייחוס
              (<code>npm run import:force-structure</code>).
            </div>
          ) : view === "table" ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  <th className="text-right p-2">תפקיד</th>
                  <th className="text-right p-2">תקן</th>
                  <th className="text-right p-2">חייל</th>
                  <th className="text-right p-2">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {viewRoles.map((r) => (
                  <tr key={r.role_id} className="border-b">
                    <td className="p-2 font-medium">{r.role_name}</td>
                    <td className="p-2">{r.serial}</td>
                    <td className="p-2">{r.full_name ?? "—"}</td>
                    <td className="p-2">{statusLabel(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            groupBySquad(viewRoles).map(([zone, teams]) => {
              const zr = teams.flatMap((t) => t.roles);
              const empt = zr.filter((r) => r.status === "empty").length;
              const red = zr.filter((r) => r.status === "red").length;
              return (
                <div
                  key={zone}
                  className="rounded-[var(--radius)] p-3.5"
                  style={{ background: "var(--fs-zone-bg)", border: "1px solid var(--fs-zone-line)" }}
                >
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex gap-2">
                      <span className="text-sm text-muted-foreground">{zr.length} תפקידים</span>
                      {empt > 0 && (
                        <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-[oklch(0.76_0.16_70_/_0.16)]">
                          {empt} ריקים
                        </span>
                      )}
                      {red > 0 && (
                        <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-[var(--fs-bad-pill)] text-[var(--fs-bad-ink)]">
                          {red} חסרי הסמכה
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-extrabold">{zone}</h2>
                  </div>
                  {teams.map((team) => {
                    const cards = (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {team.roles.map((r) => (
                          <RoleCard
                            key={r.role_id}
                            role={r}
                            editMode={editMode}
                            picked={picked?.from === "role" && picked.roleId === r.role_id}
                            dropOk={dropRole === r.role_id}
                            dropLabel={r.status === "empty" ? "שבץ כאן" : "החלפה"}
                            onClick={() => onCardClick(r)}
                            onDragStart={(e) => {
                              if (!editMode || !r.assignment_id) return;
                              e.dataTransfer.setData("text/plain", `role:${r.assignment_id}`);
                            }}
                            onDragEnd={() => {
                              setDropRole(null);
                              setDropBank(false);
                            }}
                            onDragOver={() => editMode && setDropRole(r.role_id)}
                            onDrop={(payload) => {
                              setDropRole(null);
                              const [kind, id] = payload.split(":");
                              if (kind === "role") void moveRole(Number(id), { kind: "role", role_id: r.role_id });
                              if (kind === "bank") void moveBank(Number(id), r.role_id);
                            }}
                          />
                        ))}
                      </div>
                    );
                    if (!team.name) return <div key="none">{cards}</div>;
                    const squadHas = team.roles.some((x) =>
                      companyRoles
                        .filter((y) => y.squad === x.squad && y.department === x.department)
                        .some((y) => y.held.some(isDroneCert))
                    );
                    return (
                      <div
                        key={team.name}
                        className="border border-dashed rounded-xl p-3 bg-white mb-3 last:mb-0"
                        style={{ borderColor: "var(--fs-zone-line)" }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className={cn(
                              "text-[0.66rem] font-semibold rounded-full px-2 py-0.5 border",
                              squadHas
                                ? "bg-[oklch(0.62_0.16_155_/_0.13)] text-[var(--fs-ok-ink)]"
                                : "bg-[var(--fs-bad-pill)] text-[var(--fs-bad-ink)]"
                            )}
                          >
                            {squadHas ? "רחפן בחוליה ✓" : "אין רחפן בחוליה ✗"}
                          </span>
                          <span className="text-[0.78rem] font-bold text-muted-foreground">{team.name}</span>
                        </div>
                        {cards}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <aside className="space-y-2 lg:sticky lg:top-4">
          <div
            id="bankPanel"
            className={cn(
              "rounded-[var(--radius)] border bg-card overflow-hidden",
              dropBank && "outline outline-3 outline-[#c9791c] bg-[#fffdf6]"
            )}
            onDragOver={(e) => {
              if (!editMode) return;
              e.preventDefault();
              setDropBank(true);
            }}
            onDragLeave={() => setDropBank(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropBank(false);
              const payload = e.dataTransfer.getData("text/plain");
              const [kind, id] = payload.split(":");
              if (kind === "role") void moveRole(Number(id), { kind: "bank" });
            }}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2.5 border-b text-sm"
              onClick={() => setBankOpen(!bankOpen)}
            >
              <span className="font-bold">
                {bankOpen ? "▾" : "▸"} בנק 120%
              </span>
              <span className="text-xs rounded-full px-2 py-0.5 border bg-accent">{companyBank.length}</span>
            </button>
            {bankOpen && (
              <div className="p-3 space-y-2">
                <div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden relative">
                    <i
                      className="block h-full"
                      style={{
                        width: `${Math.min((actual / Math.max(cap, 1)) * 100, 100)}%`,
                        background: "linear-gradient(to left, var(--chart-1), var(--chart-4))",
                      }}
                    />
                    <span
                      className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-foreground opacity-55"
                      style={{ insetInlineStart: `${establishment === 0 ? 0 : (establishment / cap) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {actual} חיילים בפועל · תקן {establishment} · תקרה {cap} (120%) · <b>{pct}%</b>
                    {overCap && <span className="text-[var(--fs-bad-ink)]"> — מעל התקרה, שמירה חסומה</span>}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
                  {companyBank.map((b) => (
                    <div
                      key={b.id}
                      className={cn(
                        "rounded-md p-2 border-[1.5px] border-dashed",
                        editMode && "cursor-grab",
                        picked?.from === "bank" && picked.bankId === b.id && "border-solid border-primary"
                      )}
                      style={{ borderInlineEnd: "4px solid #b05423" }}
                      draggable={editMode || undefined}
                      onDragStart={(e) => {
                        if (!editMode) return;
                        e.dataTransfer.setData("text/plain", `bank:${b.id}`);
                      }}
                      onClick={() => {
                        if (!editMode) return;
                        if (picked?.from === "role") {
                          void moveRole(picked.assignmentId, { kind: "bank" });
                          setPicked(null);
                          return;
                        }
                        setPicked({ from: "bank", bankId: b.id });
                      }}
                    >
                      <div className="text-[0.8rem] font-extrabold">{b.full_name}</div>
                      <div className="text-[0.63rem] text-muted-foreground">{b.department}</div>
                    </div>
                  ))}
                  {companyBank.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-2">אין חיילים בבנק לפלוגה זו.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius)] border bg-card overflow-hidden opacity-80">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2.5 border-b text-sm"
              onClick={() => setXferOpen(!xferOpen)}
            >
              <span className="font-bold">{xferOpen ? "▾" : "▸"} העברה לפלוגה</span>
              <span className="text-xs rounded-full px-2 py-0.5 border">מחוץ לסקופ</span>
            </button>
            {xferOpen && (
              <div className="p-3 text-sm text-muted-foreground">
                העברת חיילים בין פלוגות ובין בנקים. מחוץ לסקופ הפאזה הזו. הפאנל מוצג מקופל ומושבת.
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="rounded-[var(--radius)] border bg-card p-3 flex flex-wrap gap-4 text-xs text-muted-foreground items-center">
        <span>
          <i
            className="inline-block w-3.5 h-3.5 rounded align-[-2px] me-1 border-2"
            style={{ background: "var(--fs-ok-bg)", borderColor: "var(--fs-ok-line)" }}
          />
          מאויש ומוסמך
        </span>
        <span>
          <i
            className="inline-block w-3.5 h-3.5 rounded align-[-2px] me-1 border-2"
            style={{ background: "var(--fs-bad-bg)", borderColor: "var(--fs-bad-line)" }}
          />
          מאויש · חסרה הסמכה
        </span>
        <span>
          <i
            className="inline-block w-3.5 h-3.5 rounded align-[-2px] me-1 border-2 border-dashed"
            style={{ borderColor: "var(--fs-empty-line)" }}
          />
          תקן ריק
        </span>
        <span>🔒 דרישות התקן נעולות — לא ניתנות לעריכה מהמסך הזה</span>
        <span>&quot;/&quot; = דרישה חלופית</span>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={(open) => !busy && setConfirmCancel(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול שינויים</AlertDialogTitle>
            <AlertDialogDescription>
              לבטל את השינויים? כל השינויים שביצעת לא יישמרו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>המשך עריכה</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={busy}
              onClick={(e) => {
                // The dialog closes itself on click; the revert has to finish first so a
                // failure can leave the user where they were.
                e.preventDefault();
                void confirmCancelEditing();
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              בטל שינויים
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function isDroneCert(c: string) {
  return c.includes("רחפן") || c === "רחפן";
}
function isDroneReq(c: string) {
  return c.trim() === "רחפן" || c.trim() === "רחפנים";
}

function squadZone(squad: string) {
  return squad.replace(/חוליה.*/, "").trim() || squad;
}

function groupBySquad(roles: CanvasRoleRow[]) {
  const zoneOrder: { zone: string; teams: { name: string | null; roles: CanvasRoleRow[] }[] }[] = [];
  for (const r of roles) {
    const zone = r.squad ? squadZone(r.squad) : "מפקדה";
    let z = zoneOrder.find((x) => x.zone === zone);
    if (!z) {
      z = { zone, teams: [] };
      zoneOrder.push(z);
    }
    const teamName = r.squad;
    let t = z.teams.find((x) => x.name === teamName);
    if (!t) {
      t = { name: teamName, roles: [] };
      z.teams.push(t);
    }
    t.roles.push(r);
  }
  return zoneOrder.map((z) => [z.zone, z.teams] as const);
}

function statusLabel(r: CanvasRoleRow) {
  if (r.status === "ok") return "מוסמך";
  if (r.status === "empty") return "תקן ריק";
  if (r.status === "pending") return "ממתין לזהות";
  const missing = requirementsOf(r).filter((req) => {
    if (isDroneReq(req)) return !r.held.some(isDroneCert);
    return !req.split(/\s*\/\s*/).some((alt) => r.held.includes(alt.trim()));
  });
  return "חסר " + missing.join(", ");
}

function RoleCard({
  role: r,
  editMode,
  picked,
  dropOk,
  dropLabel,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  role: CanvasRoleRow;
  editMode: boolean;
  picked: boolean;
  dropOk: boolean;
  dropLabel: string;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: (payload: string) => void;
}) {
  const st = r.status === "pending" ? "red" : r.status;
  return (
    <div
      className={cn(
        "rounded-[0.85rem] p-2 flex flex-col gap-1.5 text-[0.8rem] min-h-[130px] border-2 relative",
        st === "ok" && "border-[var(--fs-ok-line)] bg-[var(--fs-ok-bg)]",
        st === "red" && "border-[var(--fs-bad-line)] bg-[var(--fs-bad-bg)]",
        st === "empty" && "border-dashed border-[var(--fs-empty-line)] bg-transparent",
        editMode && "cursor-pointer",
        picked && "ring-3 ring-primary/40",
        dropOk && "outline outline-3 outline-primary bg-accent"
      )}
      data-droplabel={dropOk ? dropLabel : undefined}
      onClick={onClick}
      onDragOver={(e) => {
        if (!editMode) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e.dataTransfer.getData("text/plain"));
      }}
    >
      {dropOk && (
        <span className="absolute -top-2.5 start-1/2 -translate-x-1/2 bg-primary text-white text-[0.6rem] font-extrabold px-1.5 rounded-full z-10">
          {dropLabel}
        </span>
      )}
      <div className="flex items-start justify-between gap-1">
        <span className="text-[0.7rem] opacity-50">🔒</span>
        <div className="text-end">
          <div
            className="font-extrabold text-[0.86rem] leading-tight"
            style={{
              color: st === "ok" ? "var(--fs-ok-ink)" : st === "red" ? "var(--fs-bad-ink)" : "var(--fs-empty-ink)",
            }}
          >
            {r.role_name}
          </div>
          <div className="text-[0.7rem] tabular-nums opacity-75 font-semibold">{r.serial}</div>
        </div>
      </div>
      <div
        className={cn(
          "bg-white border border-black/5 rounded-md px-2 py-1.5 flex-1 flex flex-col justify-center",
          st === "empty" && "bg-transparent border-dashed items-center",
          editMode && r.assignment_id && "cursor-grab"
        )}
        draggable={editMode && r.assignment_id ? true : undefined}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {r.full_name ? (
          <>
            <div className="font-bold text-[0.84rem]">{r.full_name}</div>
            <div
              className="text-[0.68rem] font-semibold"
              style={{ color: st === "ok" ? "var(--fs-ok-ink)" : "var(--fs-bad-ink)" }}
            >
              {r.held.length ? r.held.join(", ") : "ללא הסמכות"}
            </div>
          </>
        ) : (
          <div className="text-[var(--fs-empty-ink)] font-semibold text-[0.78rem]">
            {editMode ? "שחרר כאן" : "— תקן ריק —"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-0.5">
        {requirementsOf(r).map((q) => {
          const held =
            r.is_manned &&
            (isDroneReq(q) ? true : q.split(/\s*\/\s*/).some((alt) => r.held.includes(alt.trim())));
          return (
            <span
              key={q}
              className={cn(
                "text-[0.66rem] font-semibold px-1.5 py-px rounded border",
                !r.is_manned && "bg-muted",
                r.is_manned && held && "bg-[var(--fs-ok-pill)] border-[var(--fs-ok-line)] text-[var(--fs-ok-ink)]",
                r.is_manned && !held && "bg-[var(--fs-bad-pill)] border-[var(--fs-bad-line)] text-[var(--fs-bad-ink)]"
              )}
            >
              {q}
              {r.is_manned ? (held ? " ✓" : " ✗") : ""}
            </span>
          );
        })}
      </div>
      <span
        className="self-start text-[0.68rem] font-bold px-2 py-0.5 rounded-full"
        style={{
          background:
            st === "ok" ? "var(--fs-ok-pill)" : st === "red" ? "var(--fs-bad-pill)" : "#f0f1f3",
          color: st === "ok" ? "var(--fs-ok-ink)" : st === "red" ? "var(--fs-bad-ink)" : "var(--fs-empty-ink)",
        }}
      >
        {statusLabel(r)}
      </span>
    </div>
  );
}
