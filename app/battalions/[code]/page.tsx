import { notFound } from "next/navigation";
import { getBattalionByCode } from "@/lib/db/repositories/battalions";
import { listRequests } from "@/lib/db/repositories/requests";
import { getBattalionSummary } from "@/lib/db/repositories/battalion-summary";
import {
  listAllocationOpportunities,
  listBattalionAllocations,
  listBattalionTasks,
  listAdminConfirmations,
  getQuarterCompletion,
} from "@/lib/db/repositories/battalion-dashboard";
import { countPendingIdentity } from "@/lib/db/repositories/force-structure";
import { getCurrentUser } from "@/lib/auth/user";
import { getBattalionScope } from "@/lib/auth/scope";
import { canEditBattalion } from "@/lib/auth/permissions";
import { BattalionDashboard } from "@/components/battalions/battalion-dashboard";
import {
  listInfluencingFactors,
  getInfluencingFactorBattalions,
} from "@/lib/db/repositories/influencing-factors";
import { certificationToCalendarItem, influencingFactorToCalendarItem } from "@/components/calendar/types";
import { certificationColor } from "@/lib/utils/cert-colors";

export const dynamic = "force-dynamic";

export default async function BattalionDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const battalion = await getBattalionByCode(code);
  if (!battalion) notFound();

  const scope = await getBattalionScope();
  if (scope && scope.battalionId !== battalion.id) notFound();

  const me = await getCurrentUser();
  const canEdit = canEditBattalion(me, battalion.id);
  const certificationHref = (certificationId: number) =>
    scope
      ? `/battalions/${battalion.code}/certifications/${certificationId}`
      : `/certifications/${certificationId}`;

  const [summary, allocations, adminRows, quarter, requests, pendingIdentity, factors] =
    await Promise.all([
      getBattalionSummary(battalion.id),
      listBattalionAllocations(battalion.id),
      listAdminConfirmations(battalion.id),
      getQuarterCompletion(battalion.id),
      listRequests({ battalionCode: code }),
      countPendingIdentity(battalion.id),
      listInfluencingFactors(),
    ]);

  // AUTHORIZATION: `scope` above already 404s a battalion-scoped user asking about another
  // battalion, and every query below is keyed to `battalion.id` from the URL — never to the
  // `active_role` cookie, which is a display selector and is not read here. A brigade user
  // previewing 9308 therefore gets byte-identical data to a scoped 9308 user.
  const [tasks, opportunities] = await Promise.all([
    listBattalionTasks(battalion.id, allocations, pendingIdentity),
    // THE single eligibility source: the band, its counter, the calendar highlight and the
    // weekly PDF all read this one result set.
    listAllocationOpportunities(battalion.id),
  ]);

  const certItems = allocations.map((a) =>
    certificationToCalendarItem({
      id: a.certification_id,
      template_id: null,
      name: a.name,
      domain: null,
      start_date: a.start_date,
      end_date: a.end_date,
      location: a.location,
      total_slots: a.allocated_slots,
      registration_open: 0,
      registration_lock_date: a.registration_lock_date,
      registration_lock_hour: a.registration_lock_hour,
      status: a.status,
      notes: null,
      origin_request_id: null,
      gap_row_id: null,
      created_by_role: "",
      color_hex: a.color_hex,
      created_at: "",
      updated_at: "",
      registered_count: a.registered,
      slots_remaining: a.remaining,
      battalions: [{ code: battalion.code, name: battalion.name, color_hex: battalion.color_hex }],
    })
  );

  // An open-to-all cycle has no quota row and may have no roster row for this battalion, so
  // `listBattalionAllocations` cannot see it — without this the certification the band
  // points at would have no bar on the calendar to highlight. `battalions: []` is the
  // truth: nobody is allocated, which is what makes the pool shared.
  const allocationIds = new Set(allocations.map((a) => a.certification_id));
  const openToAllItems = opportunities
    .filter((c) => c.mode === "open_to_all" && !allocationIds.has(c.certification_id))
    .map((c) =>
    certificationToCalendarItem({
      id: c.certification_id,
      template_id: null,
      name: c.name,
      domain: null,
      start_date: c.start_date,
      end_date: c.end_date,
      location: c.location,
      total_slots: c.seats,
      registration_open: 1,
      registration_lock_date: c.registration_lock_date,
      registration_lock_hour: c.registration_lock_hour,
      status: c.status,
      notes: null,
      origin_request_id: null,
      gap_row_id: null,
      created_by_role: "",
      color_hex: c.color_hex,
      created_at: "",
      updated_at: "",
      registered_count: c.taken,
      slots_remaining: c.remaining,
      battalions: [],
    })
  );

  const factorItems = (
    await Promise.all(
      factors.map(async (f) => {
        const bns = await getInfluencingFactorBattalions(f.id);
        return influencingFactorToCalendarItem(f, bns);
      })
    )
  ).map((item) =>
    scope ? { ...item, battalions: item.battalions.filter((b) => b.code === battalion.code) } : item
  );

  const calendarItems = [
    ...factorItems,
    ...[...certItems, ...openToAllItems].map((item) => ({
      ...item,
      href: certificationHref(item.id),
      color: item.color || certificationColor(item.name),
    })),
  ];

  return (
    <BattalionDashboard
      battalion={battalion}
      summary={summary}
      allocations={allocations}
      opportunities={opportunities}
      tasks={tasks}
      adminRows={adminRows}
      quarter={quarter}
      requests={requests}
      calendarItems={calendarItems}
      canEdit={canEdit}
      scopedCertLinks={Boolean(scope)}
    />
  );
}
