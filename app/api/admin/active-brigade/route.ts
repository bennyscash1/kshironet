import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canSwitchActiveBrigade } from "@/lib/auth/permissions";
import { getBrigadeByPublicId } from "@/lib/db/repositories/brigades";
import { setActiveBrigade } from "@/lib/db/repositories/users";
import { activeBrigadeSwitchSchema } from "@/lib/validation/brigade";

/**
 * Switches which brigade the caller is acting in, or clears the selection.
 *
 * A POST, not a GET on /admin/brigades/<id>, and that distinction is load-bearing: Next.js
 * prefetches links in the viewport, so a GET that mutates would switch the active brigade
 * merely because a menu item scrolled into view. The page at /admin/brigades/<public_id>
 * is read-only; this is the only thing that writes.
 *
 * It can only ever write the CALLER'S OWN row — there is no user id in the payload, and
 * `setActiveBrigade` is called with the authenticated id.
 */
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canSwitchActiveBrigade(me)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = activeBrigadeSwitchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Clearing is a distinct action, not "select nothing": a super admin with no brigade
  // selected sees an explicit empty state, which is a different thing from a broken one.
  if (parsed.data.action === "clear") {
    await setActiveBrigade(me.id, null);
    return NextResponse.json({ ok: true, brigade: null });
  }

  const brigade = await getBrigadeByPublicId(parsed.data.brigade_public_id);
  if (!brigade) {
    return NextResponse.json({ error: "החטיבה שנבחרה אינה קיימת" }, { status: 400 });
  }
  if (brigade.is_active !== 1) {
    return NextResponse.json(
      { error: "לא ניתן לעבור לחטיבה מושבתת" },
      { status: 400 }
    );
  }

  await setActiveBrigade(me.id, brigade.id);
  return NextResponse.json({
    ok: true,
    brigade: { public_id: brigade.public_id, name: brigade.name },
  });
}
