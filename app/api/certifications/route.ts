import { NextResponse } from "next/server";
import {
  createCertification,
  listCertifications,
  replacePrerequisites,
  replaceQuotas,
  replaceTaxes,
} from "@/lib/db/repositories/certifications";
import { certificationCreateSchema } from "@/lib/validation/certification";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";
import type { CertificationStatus } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const certs = await listCertifications({
    battalionCode: url.searchParams.get("battalion") ?? undefined,
    status: (url.searchParams.get("status") as CertificationStatus) ?? undefined,
    domain: url.searchParams.get("domain") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  return NextResponse.json(certs);
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const parsed = certificationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // is_unlimited is UI-only: unlimited is persisted as total_slots = null.
  const { prerequisites, quotas, taxes, is_unlimited, ...certInput } = parsed.data;
  const id = await createCertification({
    ...certInput,
    total_slots: is_unlimited ? null : certInput.total_slots ?? null,
    created_by_role: role,
  });
  if (prerequisites.length) await replacePrerequisites(id, prerequisites);
  if (quotas.length) await replaceQuotas(id, quotas);
  if (taxes.length) await replaceTaxes(id, taxes);
  return NextResponse.json({ id }, { status: 201 });
}
