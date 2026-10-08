import { NextResponse } from "next/server";
import { requireBattalionManager } from "@/lib/brigades/guard";
import { battalionWriteFailure } from "@/lib/brigades/battalion-errors";
import {
  createBattalion,
  listAllBattalionsForBrigade,
} from "@/lib/db/repositories/battalions";
import { getBrigadeById } from "@/lib/db/repositories/brigades";
import { battalionCreateSchema } from "@/lib/validation/battalion";

/**
 * Battalion administration.
 *
 * Under /api/admin rather than /api/battalions on purpose: /api/battalions is listed in
 * BATTALION_SCOPED_API_PREFIXES (lib/auth/battalion-scope.ts), so a battalion-scoped role
 * is allowed to reach it. Putting administrative writes behind that prefix would mean
 * teaching isWriteAllowedForBattalionEditor about them. /api/admin is already blanket-gated
 * in the proxy — defence in depth, never the gate: each handler calls
 * requireBattalionManager() itself, because the proxy's role-derivation block is wrapped in
 * try/catch and falls through on error.
 *
 * There is no tenant context yet, so `brigade_id` is an explicit parameter on create,
 * validated against the brigades table and authorized server-side. It never comes from a
 * cookie, and `getCurrentRole()` does not appear in this slice.
 */

export async function GET(request: Request) {
  const gate = await requireBattalionManager();
  if (gate instanceof NextResponse) return gate;

  const brigadeId = Number(new URL(request.url).searchParams.get("brigade_id"));
  if (!Number.isInteger(brigadeId) || brigadeId <= 0) {
    return NextResponse.json({ error: "יש לבחור חטיבה" }, { status: 400 });
  }
  if (!(await getBrigadeById(brigadeId))) {
    return NextResponse.json({ error: "החטיבה שנבחרה אינה קיימת" }, { status: 400 });
  }

  return NextResponse.json(await listAllBattalionsForBrigade(brigadeId));
}

export async function POST(request: Request) {
  const gate = await requireBattalionManager();
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const parsed = battalionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Existence is checked here for a clean Hebrew 400; battalions_brigade_fk is the
  // backstop. Same belt-and-braces as `getBattalionById` in /api/admin/users/[id].
  if (!(await getBrigadeById(parsed.data.brigade_id))) {
    return NextResponse.json({ error: "החטיבה שנבחרה אינה קיימת" }, { status: 400 });
  }

  try {
    const id = await createBattalion({
      brigadeId: parsed.data.brigade_id,
      code: parsed.data.code,
      name: parsed.data.name,
      colorHex: parsed.data.color_hex,
    });
    return NextResponse.json({ id }, { status: 201 });
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
    console.error("POST /api/admin/battalions failed", err);
    return NextResponse.json({ error: "יצירת הגדוד נכשלה" }, { status: 500 });
  }
}
