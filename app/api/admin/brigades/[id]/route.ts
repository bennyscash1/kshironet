import { NextResponse } from "next/server";
import { requireBrigadeManager } from "@/lib/brigades/guard";
import { brigadeWriteFailure } from "@/lib/brigades/errors";
import { renameBrigade, setBrigadeActive } from "@/lib/db/repositories/brigades";
import { brigadePatchSchema } from "@/lib/validation/brigade";

/** Rename, or activate/deactivate. There is no DELETE: deactivation is a soft state
 * change so a brigade's data stays attributable. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireBrigadeManager();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const brigadeId = Number(id);
  if (!Number.isInteger(brigadeId) || brigadeId <= 0) {
    return NextResponse.json({ error: "מזהה חטיבה אינו תקין" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = brigadePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const found =
      parsed.data.action === "rename"
        ? await renameBrigade(brigadeId, parsed.data.name)
        : await setBrigadeActive(brigadeId, parsed.data.is_active);

    // The repositories report whether a row matched, so a PATCH against a brigade that
    // does not exist answers 404 instead of reporting a successful no-op.
    if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const failure = brigadeWriteFailure(err);
    if (failure) {
      return NextResponse.json({ error: failure.message }, { status: failure.status });
    }
    console.error(`PATCH /api/admin/brigades/${brigadeId} failed`, err);
    return NextResponse.json({ error: "עדכון החטיבה נכשל" }, { status: 500 });
  }
}
