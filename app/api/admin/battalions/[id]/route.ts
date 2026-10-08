import { NextResponse } from "next/server";
import { requireBattalionManager } from "@/lib/brigades/guard";
import { battalionWriteFailure } from "@/lib/brigades/battalion-errors";
import {
  countUsersForBattalion,
  getBattalionById,
  setBattalionActive,
  updateBattalion,
} from "@/lib/db/repositories/battalions";
import { battalionPatchSchema } from "@/lib/validation/battalion";

/**
 * Update name/colour, or activate/deactivate. There is no DELETE: deactivation is a soft
 * state change so a battalion's roster entries, requests, quotas and companies stay
 * attributable. `code` is immutable — see lib/validation/battalion.ts for the six audit
 * columns a rename would orphan.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireBattalionManager();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const battalionId = Number(id);
  if (!Number.isInteger(battalionId) || battalionId <= 0) {
    return NextResponse.json({ error: "מזהה גדוד אינו תקין" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = battalionPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve the row first: the battalion's own brigade_id is the authorization target, and
  // it comes from the database rather than from the request.
  const battalion = await getBattalionById(battalionId);
  if (!battalion) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    if (parsed.data.action === "update") {
      const found = await updateBattalion(battalionId, {
        name: parsed.data.name,
        colorHex: parsed.data.color_hex,
      });
      if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // Deactivation is refused while any user is still scoped to the battalion.
    //
    // users_battalion_scope_valid (012) requires battalion_id NOT NULL for
    // editor_battalion and viewer_battalion, and no scope helper in lib/auth/ consults
    // battalions.is_active — so deactivating with users attached would leave them with
    // full write access to a unit the pickers and the gaps grid treat as gone. Refusing is
    // the only behaviour with no undefined state, and it is trivially relaxable later.
    if (!parsed.data.is_active) {
      const assigned = await countUsersForBattalion(battalionId);
      if (assigned > 0) {
        return NextResponse.json(
          {
            error: `לא ניתן להשבית גדוד שמשויכים אליו משתמשים (${assigned}). יש לשנות את השיוך שלהם תחילה במסך ניהול ההרשאות.`,
          },
          { status: 409 }
        );
      }
    }

    const found = await setBattalionActive(battalionId, parsed.data.is_active);
    if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const failure = battalionWriteFailure(err);
    if (failure) {
      // A duplicate code is a validation failure on `code`, so it is returned in the same
      // Zod-flatten shape every other validation failure uses — the client renders it
      // against the field rather than as a banner, and nothing new is needed to display it.
      if (failure.field) {
        return NextResponse.json(
          { error: { formErrors: [], fieldErrors: { [failure.field]: [failure.message] } } },
          { status: failure.status }
        );
      }
      return NextResponse.json({ error: failure.message }, { status: failure.status });
    }
    console.error(`PATCH /api/admin/battalions/${battalionId} failed`, err);
    return NextResponse.json({ error: "עדכון הגדוד נכשל" }, { status: 500 });
  }
}
