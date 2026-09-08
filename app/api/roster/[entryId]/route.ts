import { NextResponse } from "next/server";
import { deleteRosterEntry, getRosterEntry, updateRosterEntry } from "@/lib/db/repositories/roster";
import { rosterEntrySchema } from "@/lib/validation/roster";
import { requireApprovedUser } from "@/lib/auth/user";
import { canManageRosterEntry } from "@/lib/auth/permissions";

/**
 * One roster entry.
 *
 * BEFORE THIS CHANGE, PATCH AND DELETE HAD NO AUTHORIZATION AT ALL — not a weak check, no
 * check. Anything that reached the handler could rewrite or delete any soldier on any
 * certification; only the proxy's blanket "viewers cannot write" rule stood in the way.
 * Both now resolve the entry's owning battalion server-side and run the one roster
 * permission against the AUTHENTICATED user.
 */

/**
 * Loads the entry and confirms the caller may write to it. Returns the entry, or the
 * response to send back.
 *
 * 404 rather than 403 for another battalion's entry: whether a given id exists, and whose
 * soldier it is, is not something a scoped editor is entitled to learn by probing ids.
 * A single lookup serves both the check and the handler — no second query.
 */
async function gateEntry(entryId: number) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return { response: gate };

  if (!Number.isInteger(entryId)) {
    return { response: NextResponse.json({ error: "invalid entry" }, { status: 400 }) };
  }

  const entry = await getRosterEntry(entryId);
  if (!entry) return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };

  if (!canManageRosterEntry(gate, entry.battalion_id)) {
    return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  }
  return { user: gate, entry };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await params;
  const entry = await getRosterEntry(Number(entryId));
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(entry);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await params;
  const gate = await gateEntry(Number(entryId));
  if (gate.response) return gate.response;

  const body = await request.json();
  const parsed = rosterEntrySchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The payload may MOVE the entry to another battalion, so the destination is checked as
  // well as the origin. Without this a battalion editor could hand their own soldier to a
  // unit they have no rights over — a write to a battalion they cannot write to, arrived at
  // sideways.
  const target = parsed.data.battalion_id;
  if (target !== undefined && !canManageRosterEntry(gate.user, target)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await updateRosterEntry(Number(entryId), parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await params;
  const gate = await gateEntry(Number(entryId));
  if (gate.response) return gate.response;

  await deleteRosterEntry(Number(entryId));
  return NextResponse.json({ ok: true });
}
