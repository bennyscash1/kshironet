import { NextResponse } from "next/server";
import { requireBrigadeManager } from "@/lib/brigades/guard";
import { brigadeWriteFailure } from "@/lib/brigades/errors";
import { createBrigade, listBrigades } from "@/lib/db/repositories/brigades";
import { brigadeCreateSchema } from "@/lib/validation/brigade";

/**
 * Brigade administration. Lives under /api/admin so it inherits the proxy's
 * super_admin-only rule for that prefix — defence in depth, not the gate: every handler
 * calls requireBrigadeManager() in its own body because the proxy's role-derivation block
 * is wrapped in try/catch and falls through on error.
 */

export async function GET() {
  const gate = await requireBrigadeManager();
  if (gate instanceof NextResponse) return gate;

  return NextResponse.json(await listBrigades());
}

export async function POST(request: Request) {
  const gate = await requireBrigadeManager();
  if (gate instanceof NextResponse) return gate;
  const me = gate;

  const body = await request.json();
  const parsed = brigadeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const id = await createBrigade({ name: parsed.data.name, createdBy: me.id });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    // Duplicate name, blank name, or the single-brigade guard — each mapped to a Hebrew
    // message by SQLSTATE. Never `(err as Error).message`: raw Postgres text names the
    // table, the constraint and the trigger function.
    const failure = brigadeWriteFailure(err);
    if (failure) {
      return NextResponse.json({ error: failure.message }, { status: failure.status });
    }
    console.error("POST /api/admin/brigades failed", err);
    return NextResponse.json({ error: "יצירת החטיבה נכשלה" }, { status: 500 });
  }
}
