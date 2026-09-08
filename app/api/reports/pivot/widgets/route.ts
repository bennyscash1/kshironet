import { NextResponse } from "next/server";
import { createSavedWidget, listSavedWidgets } from "@/lib/db/repositories/pivot-widgets";
import { pivotWidgetSaveSchema } from "@/lib/validation/pivot";
import { requireApprovedUser } from "@/lib/auth/user";

/** All saved pivot widgets. Global — not scoped to the caller. */
export async function GET() {
  // Any approved user may read AND write saved widgets, viewers included. The identity
  // comes from the authenticated session; the active_role cookie is a view-scope
  // selector and is never consulted for authorization.
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  return NextResponse.json(await listSavedWidgets());
}

/** Saves a widget. `created_by` is taken from the session, never from the payload. */
export async function POST(request: Request) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;
  const user = gate;

  const body = await request.json();
  const parsed = pivotWidgetSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await createSavedWidget({
    name: parsed.data.name,
    config: parsed.data.config,
    created_by: user.id,
  });
  return NextResponse.json(created, { status: 201 });
}
