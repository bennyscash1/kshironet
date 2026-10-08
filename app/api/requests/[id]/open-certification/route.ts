import { NextResponse } from "next/server";
import { unscopedBlockFailure } from "@/lib/brigades/unscoped-guard";
import { openCertificationFromRequest } from "@/lib/db/repositories/requests";
import { certificationSchema } from "@/lib/validation/certification";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = certificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { prerequisites, quotas, taxes, ...certInput } = parsed.data;
  try {
    const certId = await openCertificationFromRequest(Number(id), certInput, role);
    if (prerequisites.length || quotas.length || taxes.length) {
      const { replacePrerequisites, replaceQuotas, replaceTaxes } = await import(
        "@/lib/db/repositories/certifications"
      );
      if (prerequisites.length) await replacePrerequisites(certId, prerequisites);
      if (quotas.length) await replaceQuotas(certId, quotas);
      if (taxes.length) await replaceTaxes(certId, taxes);
    }
    return NextResponse.json({ certificationId: certId }, { status: 201 });
  } catch (err) {
    // The second creation path for `certifications` — openCertificationFromRequest calls
    // createCertification, so the same trigger refuses it. Checked BEFORE the fallback
    // below, which would otherwise put the trigger's raw text (naming the table and the
    // function) straight into the response.
    const blocked = unscopedBlockFailure(err);
    if (blocked) {
      return NextResponse.json({ error: blocked.message }, { status: blocked.status });
    }
    // Pre-existing behaviour, left as-is: this route surfaces repository error messages
    // directly. Out of scope for this slice, but it is why the check above must come
    // first rather than being appended after it.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
