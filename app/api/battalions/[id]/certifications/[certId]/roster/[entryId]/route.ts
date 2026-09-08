import { NextResponse } from "next/server";
import {
  deleteRosterEntry,
  getBattalionQuotaUsage,
  getRosterEntry,
  updateRosterEntry,
} from "@/lib/db/repositories/roster";
import type { BattalionQuotaUsage } from "@/lib/db/repositories/roster";
import { battalionRosterEntrySchema } from "@/lib/validation/roster";
import { requireBattalionEditor } from "@/lib/auth/scope";
import type { RosterEntry } from "@/lib/types";
import { REGISTRATION_LOCKED_MESSAGE } from "@/lib/utils/registration-lock";

/**
 * A single soldier of one battalion on one certification. Both the battalion and the
 * certification come from the path and must match the stored row, so a battalion editor
 * can never reach another unit's entry by guessing an id.
 *
 * Once the allocation's registration deadline has passed the list is frozen here — the
 * same deadline that closes registration in `approve-trainees`.
 */

interface Resolved {
  battalionId: number;
  certificationId: number;
  entryId: number;
}

function parseIds(id: string, certId: string, entryId: string): Resolved | null {
  const battalionId = Number(id);
  const certificationId = Number(certId);
  const entry = Number(entryId);
  if (![battalionId, certificationId, entry].every(Number.isInteger)) return null;
  return { battalionId, certificationId, entryId: entry };
}

function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

/** `response` set = stop and return it; otherwise the request is authorized and the
 * resolved row is available. */
type Authorized =
  | { response: NextResponse; ids?: undefined; entry?: undefined; quota?: undefined }
  | { response?: undefined; ids: Resolved; entry: RosterEntry; quota: BattalionQuotaUsage };

async function authorize(
  params: Promise<{ id: string; certId: string; entryId: string }>
): Promise<Authorized> {
  const { id, certId, entryId } = await params;
  const ids = parseIds(id, certId, entryId);
  if (!ids) return { response: NextResponse.json({ error: "invalid ids" }, { status: 400 }) };

  const gate = await requireBattalionEditor(ids.battalionId);
  if (gate instanceof NextResponse) return { response: gate };

  const entry = await getRosterEntry(ids.entryId);
  // A row that belongs to a different battalion or a different certification is, as far as
  // this route is concerned, not there at all.
  if (
    !entry ||
    entry.battalion_id !== ids.battalionId ||
    entry.certification_id !== ids.certificationId
  ) {
    return { response: notFound() };
  }

  const quota = await getBattalionQuotaUsage(ids.certificationId, ids.battalionId);
  if (quota.locked) {
    return {
      response: NextResponse.json(
        { error: REGISTRATION_LOCKED_MESSAGE, reason: "registration_locked" },
        { status: 403 }
      ),
    };
  }

  return { ids, entry, quota };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; certId: string; entryId: string }> }
) {
  const authorized = await authorize(params);
  if (authorized.response) return authorized.response;
  const { ids, entry, quota } = authorized;

  const body = await request.json();
  const parsed = battalionRosterEntrySchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Moving a soldier out of the עתודה and into the allocation consumes a slot, so it faces
  // the same limit an addition does.
  const takesSlot = parsed.data.is_reserve === false && entry.is_reserve === 1;
  if (takesSlot) {
    if (quota.allocated === null) {
      return NextResponse.json(
        { error: "לא הוקצו לגדוד מקומות בהסמכה זו — לא ניתן להוציא חייל מהעתודה.", reason: "no_quota" },
        { status: 409 }
      );
    }
    if (quota.remaining !== null && quota.remaining < 1) {
      return NextResponse.json(
        {
          error: `ההקצאה לגדוד בהסמכה זו מלאה (${quota.used} מתוך ${quota.allocated}) — לא ניתן להוציא חייל מהעתודה.`,
          reason: "quota_exceeded",
        },
        { status: 409 }
      );
    }
  }

  // `battalion_id` is absent from the schema, so an edit can never move a soldier to
  // another unit.
  await updateRosterEntry(ids.entryId, { ...parsed.data, battalion_id: ids.battalionId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; certId: string; entryId: string }> }
) {
  const authorized = await authorize(params);
  if (authorized.response) return authorized.response;

  await deleteRosterEntry(authorized.ids.entryId);
  return NextResponse.json({ ok: true });
}
