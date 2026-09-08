import { NextResponse } from "next/server";
import { getBattalionById } from "@/lib/db/repositories/battalions";
import {
  listAllocationOpportunities,
  listBattalionAllocations,
} from "@/lib/db/repositories/battalion-dashboard";
import { requireApprovedUser } from "@/lib/auth/user";
import { denyOutOfScope } from "@/lib/auth/scope";
import {
  battalionIdParamSchema,
  weeklyExportQuerySchema,
} from "@/lib/validation/battalion-export";
import { buildWeeklyCertificationsPdf } from "@/lib/pdf/weekly-certifications";
import { APP_TIME_ZONE } from "@/lib/utils/registration-lock";

// jsPDF and the embedded font need the Node runtime, not the edge one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 'dd.MM.yyyy HH:mm' in Asia/Jerusalem — the timezone the whole app reasons in. */
function stampNow(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

/**
 * The battalion's certifications for one week, as a PDF the KAD can forward on.
 *
 * SAME SET AS THE SCREEN. It calls `listBattalionAllocations` with a range rather than
 * re-implementing the query, so the export cannot drift from the weekly view — including
 * the rule that matters here, that a quota with no names counts as the battalion's
 * certification.
 *
 * AUTHORIZATION IS SESSION-BASED, NEVER THE COOKIE. `active_role` is a display selector a
 * client can set to anything; it is not read here. `requireApprovedUser()` resolves the
 * signed-in user server-side, and `denyOutOfScope()` compares the requested battalion with
 * the confinement on that user's own database row — so a battalion-scoped user asking for
 * another battalion gets a 404 (not a 403: whether another battalion has data is not
 * theirs to learn). Global viewers/editors are unrestricted, exactly as elsewhere.
 *
 * A viewer, not just an editor, may export: this is a read of data they can already see on
 * the page, so `canEdit` would be the wrong gate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const parsedId = battalionIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: parsedId.error.flatten() }, { status: 400 });
  }
  const battalionId = parsedId.data;

  const denied = await denyOutOfScope(battalionId);
  if (denied) return denied;

  const url = new URL(request.url);
  const parsedQuery = weeklyExportQuerySchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 });
  }
  const { from, to } = parsedQuery.data;

  const battalion = await getBattalionById(battalionId);
  if (!battalion) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The export and the screen read the SAME eligibility set, so a row tinted in the browser
  // is tinted in the PDF and an expired one is tinted in neither.
  const [rows, opportunities] = await Promise.all([
    listBattalionAllocations(battalionId, { from, to }),
    listAllocationOpportunities(battalionId),
  ]);
  const opportunityByCert = new Map(
    opportunities.map((o) => [o.certification_id, o.mode] as const)
  );

  const pdf = buildWeeklyCertificationsPdf({
    battalionCode: battalion.code,
    battalionName: battalion.name,
    from,
    to,
    generatedAt: stampNow(),
    rows: rows.map((r) => ({
      name: r.name,
      location: r.location,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status,
      allocated_slots: r.allocated_slots,
      registered: r.registered,
      has_quota: r.has_quota,
      opportunity: opportunityByCert.get(r.certification_id) ?? null,
    })),
  });

  // The filename is ASCII-safe in `filename` with the Hebrew one in `filename*` (RFC 5987),
  // because a bare Hebrew filename in the plain parameter is mangled by some clients.
  const asciiName = `weekly-${battalion.code}-${from}.pdf`;
  const hebrewName = encodeURIComponent(`הסמכות_${battalion.name}_${from}.pdf`);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${hebrewName}`,
      "Content-Length": String(pdf.byteLength),
      // Week-scoped and permission-scoped: never let a shared cache hold this.
      "Cache-Control": "private, no-store",
    },
  });
}
