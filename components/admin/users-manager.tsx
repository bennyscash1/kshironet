"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BATTALION_SCOPED_ROLES,
  USER_ROLES,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  type AppUser,
  type Battalion,
  type UserRole,
} from "@/lib/types";

function formatDate(iso: string) {
  const [date] = iso.split("T");
  const [year, month, day] = (date ?? "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

function statusBadgeClass(status: AppUser["status"]) {
  switch (status) {
    case "approved":
      return "bg-emerald-500 text-white";
    case "pending":
      return "bg-amber-500 text-white";
    default:
      return "bg-rose-500 text-white";
  }
}

function isScopedRole(role: UserRole): boolean {
  return BATTALION_SCOPED_ROLES.includes(role);
}

/** The free text the user typed at signup. Indication for the admin only. */
function RequestedIndication({ user }: { user: AppUser }) {
  if (!user.requested_role_text && !user.requested_battalion_text) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span className="text-xs">
      {user.requested_role_text && <span>{user.requested_role_text}</span>}
      {user.requested_role_text && user.requested_battalion_text && (
        <span className="text-muted-foreground"> · </span>
      )}
      {user.requested_battalion_text && (
        <span className="text-muted-foreground">{user.requested_battalion_text}</span>
      )}
    </span>
  );
}

export function UsersManager({
  pending,
  all,
  battalions,
  currentUserId,
}: {
  pending: AppUser[];
  all: AppUser[];
  battalions: Battalion[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Battalion chosen per pending row before approving it as a scoped role. */
  const [pendingBattalion, setPendingBattalion] = useState<Record<string, number>>({});
  /** A scoped role selected for an existing user, awaiting a battalion + save. */
  const [draftScoped, setDraftScoped] = useState<
    Record<string, { role: UserRole; battalionId: number | null }>
  >({});

  const battalionName = (id: number | null) =>
    id === null ? null : battalions.find((b) => b.id === id)?.name ?? `#${id}`;

  async function patchUser(id: string, body: Record<string, unknown>, successMsg: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      toast.error("הפעולה נכשלה");
      return;
    }
    toast.success(successMsg);
    router.refresh();
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`להסיר את הגישה של ${name}?`)) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      toast.error("ההסרה נכשלה");
      return;
    }
    toast.success("הגישה הוסרה");
    router.refresh();
  }

  function approve(id: string, role: "viewer" | "editor") {
    patchUser(
      id,
      { action: "approve", role },
      role === "editor" ? "המשתמש אושר כעורך" : "המשתמש אושר כצופה"
    );
  }

  /** Approve a pending user straight into a battalion-scoped role. */
  function approveScoped(id: string, role: UserRole) {
    const battalionId = pendingBattalion[id];
    if (!battalionId) {
      toast.error("יש לבחור גדוד");
      return;
    }
    patchUser(
      id,
      { action: "approve", role, battalion_id: battalionId },
      `המשתמש אושר כ${USER_ROLE_LABELS[role]} · ${battalionName(battalionId)}`
    );
  }

  function changeRole(user: AppUser, role: UserRole) {
    if (isScopedRole(role)) {
      // A scoped role needs a battalion, so hold the choice locally until one is picked
      // (an existing scoped user keeps their current battalion as the default).
      setDraftScoped((prev) => ({
        ...prev,
        [user.id]: {
          role,
          battalionId: isScopedRole(user.role) ? user.battalion_id : null,
        },
      }));
      return;
    }
    // Global roles save immediately, exactly as before, with no battalion.
    setDraftScoped((prev) => {
      const next = { ...prev };
      delete next[user.id];
      return next;
    });
    patchUser(user.id, { action: "set_role", role }, "התפקיד עודכן");
  }

  function saveScoped(userId: string) {
    const draft = draftScoped[userId];
    if (!draft?.battalionId) {
      toast.error("יש לבחור גדוד");
      return;
    }
    patchUser(
      userId,
      { action: "set_role", role: draft.role, battalion_id: draft.battalionId },
      `התפקיד עודכן · ${battalionName(draft.battalionId)}`
    );
    setDraftScoped((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }

  return (
    <div className="space-y-8">
      {/* Pending registrations */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UserCheck className="size-5 text-amber-600" />
          ממתינים לאישור ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין משתמשים הממתינים לאישור.</p>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם מלא</TableHead>
                  <TableHead>אימייל</TableHead>
                  <TableHead>בקשת המשתמש (תפקיד · גדוד)</TableHead>
                  <TableHead>תאריך הרשמה</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "-"}</TableCell>
                    <TableCell dir="ltr">{u.email}</TableCell>
                    <TableCell>
                      <RequestedIndication user={u} />
                    </TableCell>
                    <TableCell>{formatDate(u.created_at)}</TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === u.id}
                            onClick={() => approve(u.id, "viewer")}
                          >
                            <Check className="size-4" />
                            אישור כצופה
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === u.id}
                            onClick={() => approve(u.id, "editor")}
                          >
                            <Check className="size-4" />
                            אישור כעורך
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={busyId === u.id}
                            onClick={() => deleteUser(u.id, u.full_name ?? u.email)}
                          >
                            <Trash2 className="size-4" />
                            דחייה
                          </Button>
                        </div>
                        {/* Battalion-scoped approval: pick the battalion, then the role. */}
                        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 bg-muted/30">
                          <span className="text-xs text-muted-foreground">אישור גדודי:</span>
                          <select
                            className="border rounded-md h-8 px-2 bg-background text-sm"
                            value={pendingBattalion[u.id] ?? ""}
                            onChange={(e) =>
                              setPendingBattalion((prev) => ({
                                ...prev,
                                [u.id]: Number(e.target.value),
                              }))
                            }
                          >
                            <option value="">— בחר גדוד —</option>
                            {battalions.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === u.id || !pendingBattalion[u.id]}
                            onClick={() => approveScoped(u.id, "viewer_battalion")}
                          >
                            צפייה גדודי
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === u.id || !pendingBattalion[u.id]}
                            onClick={() => approveScoped(u.id, "editor_battalion")}
                          >
                            עריכה גדודי
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* All users */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">כל המשתמשים ({all.length})</h2>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם מלא</TableHead>
                <TableHead>אימייל</TableHead>
                <TableHead>בקשת המשתמש (תפקיד · גדוד)</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>גדוד</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>תאריך הרשמה</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((u) => {
                const isSelf = u.id === currentUserId;
                const draft = draftScoped[u.id];
                const shownRole = draft?.role ?? u.role;
                const locked = busyId === u.id || isSelf || u.status !== "approved";
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.full_name ?? "-"}
                      {isSelf && <span className="text-muted-foreground"> (אתה)</span>}
                    </TableCell>
                    <TableCell dir="ltr">{u.email}</TableCell>
                    <TableCell>
                      <RequestedIndication user={u} />
                    </TableCell>
                    <TableCell>
                      <select
                        className="border rounded-md h-8 px-2 bg-background text-sm disabled:opacity-50"
                        value={shownRole}
                        disabled={locked}
                        onChange={(e) => changeRole(u, e.target.value as UserRole)}
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {USER_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      {/* Only meaningful for the two scoped roles; global roles keep NULL. */}
                      {isScopedRole(shownRole) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="border rounded-md h-8 px-2 bg-background text-sm disabled:opacity-50"
                            value={draft ? draft.battalionId ?? "" : u.battalion_id ?? ""}
                            disabled={locked}
                            onChange={(e) => {
                              const battalionId = Number(e.target.value) || null;
                              if (draft) {
                                setDraftScoped((prev) => ({
                                  ...prev,
                                  [u.id]: { ...draft, battalionId },
                                }));
                              } else if (battalionId) {
                                // Already scoped — moving them to another battalion.
                                patchUser(
                                  u.id,
                                  {
                                    action: "set_role",
                                    role: shownRole,
                                    battalion_id: battalionId,
                                  },
                                  `הגדוד עודכן · ${battalionName(battalionId)}`
                                );
                              }
                            }}
                          >
                            <option value="">— בחר גדוד —</option>
                            {battalions.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          {draft && (
                            <Button
                              size="sm"
                              disabled={locked || !draft.battalionId}
                              onClick={() => saveScoped(u.id)}
                            >
                              שמור
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">כל המערכת</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(u.status)}>
                        {USER_STATUS_LABELS[u.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(u.created_at)}</TableCell>
                    <TableCell>
                      {!isSelf && u.status !== "rejected" && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          aria-label="הסרת גישה"
                          disabled={busyId === u.id}
                          onClick={() => deleteUser(u.id, u.full_name ?? u.email)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
