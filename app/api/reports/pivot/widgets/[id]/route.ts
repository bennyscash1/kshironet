import { NextResponse } from "next/server";
import { deleteSavedWidget, updateSavedWidget } from "@/lib/db/repositories/pivot-widgets";
import { pivotWidgetIdSchema, pivotWidgetSaveSchema } from "@/lib/validation/pivot";
import { requireApprovedUser } from "@/lib/auth/user";

/** Updates a saved widget's name and configuration. Same audience as save/delete: any
 * approved user, viewers included. `created_by` is left as the original creator. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const parsedId = pivotWidgetIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = pivotWidgetSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await updateSavedWidget(parsedId.data, parsed.data);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(updated);
}

/** Deletes a saved widget. Allowed for any approved user (viewers included) — saved
 * widgets are shared report configuration, not owned data. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const parsedId = pivotWidgetIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const removed = await deleteSavedWidget(parsedId.data);
  if (removed === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
