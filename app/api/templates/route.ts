import { NextResponse } from "next/server";
import { unscopedBlockFailure } from "@/lib/brigades/unscoped-guard";
import { createTemplate, listTemplates } from "@/lib/db/repositories/templates";
import { templateSchema } from "@/lib/validation/template";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";

export async function GET() {
  return NextResponse.json(await listTemplates());
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const id = await createTemplate(parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    // certification_templates has no brigade_id yet — see migration 027.
    const blocked = unscopedBlockFailure(err);
    if (blocked) {
      return NextResponse.json({ error: blocked.message }, { status: blocked.status });
    }
    throw err;
  }
}
