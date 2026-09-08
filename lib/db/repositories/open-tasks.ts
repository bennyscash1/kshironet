import { query, queryOne } from "@/lib/db/client";
import { ACTIVE_ROSTER_STATUSES } from "@/lib/utils/slots";

export interface RegistrationGapTask {
  type: "registration_gap";
  certification_id: number;
  certification_name: string;
  registered_count: number;
  total_slots: number;
}

export interface TaxGapTask {
  type: "tax_gap";
  certification_id: number;
  certification_name: string;
  tax_id: number;
  role_name: string;
}

export interface OpenUnlimitedTask {
  type: "open_unlimited";
  certification_id: number;
  certification_name: string;
  registered_count: number;
}

export interface CompletionReminderTask {
  type: "completion_reminder";
  certification_id: number;
  certification_name: string;
}

export type OpenTask = RegistrationGapTask | TaxGapTask | OpenUnlimitedTask | CompletionReminderTask;

export async function listRegistrationGaps(): Promise<RegistrationGapTask[]> {
  const placeholders = ACTIVE_ROSTER_STATUSES.map((_, index) => `$${index + 1}`).join(",");
  const rows = await query<{
    certification_id: number; certification_name: string; total_slots: number; registered_count: number;
  }>(
      `SELECT c.id as certification_id, c.name as certification_name, c.total_slots,
              (SELECT COUNT(*)::int FROM roster_entries re
               WHERE re.certification_id = c.id AND re.status IN (${placeholders})) as registered_count
       FROM certifications c
       WHERE c.status = 'open' AND c.total_slots IS NOT NULL
       ORDER BY c.start_date`,
    ACTIVE_ROSTER_STATUSES
  );

  return rows
    .filter((r) => r.registered_count < r.total_slots)
    .map((r) => ({ type: "registration_gap" as const, ...r }));
}

export async function listOpenUnlimitedRegistrations(): Promise<OpenUnlimitedTask[]> {
  const placeholders = ACTIVE_ROSTER_STATUSES.map((_, index) => `$${index + 1}`).join(",");
  const rows = await query<{ certification_id: number; certification_name: string; registered_count: number }>(
      `SELECT c.id as certification_id, c.name as certification_name,
              (SELECT COUNT(*)::int FROM roster_entries re
               WHERE re.certification_id = c.id AND re.status IN (${placeholders})) as registered_count
       FROM certifications c
       WHERE c.status = 'open' AND c.total_slots IS NULL
       ORDER BY c.start_date`,
    ACTIVE_ROSTER_STATUSES
  );

  return rows.map((r) => ({ type: "open_unlimited" as const, ...r }));
}

export async function listTaxGaps(): Promise<TaxGapTask[]> {
  const rows = await query<{ tax_id: number; role_name: string; certification_id: number; certification_name: string }>(
      `SELECT t.id as tax_id, t.role_name, c.id as certification_id, c.name as certification_name
       FROM certification_taxes t
       JOIN certifications c ON c.id = t.certification_id
       WHERE t.is_fulfilled = 0 AND c.status NOT IN ('completed', 'cancelled')
       ORDER BY c.start_date`
  );

  return rows.map((r) => ({ type: "tax_gap" as const, ...r }));
}

export async function listPendingCompletionConfirmations(): Promise<CompletionReminderTask[]> {
  const rows = await query<{ certification_id: number; certification_name: string }>(
      `SELECT c.id as certification_id, c.name as certification_name
       FROM certifications c
       WHERE COALESCE(NULLIF(c.end_date, ''), c.start_date)::date <= CURRENT_DATE
         AND c.status NOT IN ('completed', 'cancelled')
         AND EXISTS (
           SELECT 1 FROM roster_entries re
           WHERE re.certification_id = c.id AND re.is_reserve = 0
             AND re.status IN ('registered', 'pending_approval', 'approved')
         )
       ORDER BY c.start_date`
  );

  return rows.map((r) => ({ type: "completion_reminder" as const, ...r }));
}

export async function countPendingRequests(): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM battalion_requests WHERE status IN ('opened', 'in_review')`
  );
  return row?.c ?? 0;
}

export async function countPendingApprovals(): Promise<number> {
  const row = await queryOne<{ c: number }>(
    // certification_id IS NOT NULL: request-stage soldiers have no certification to be
    // approved for, so they never count as a pending approval.
    `SELECT COUNT(*)::int as c FROM roster_entries
      WHERE status = 'pending_approval' AND certification_id IS NOT NULL`
  );
  return row?.c ?? 0;
}

export async function listOpenTasks(): Promise<OpenTask[]> {
  const [registrationGaps, taxGaps, openUnlimited, completionReminders] = await Promise.all([
    listRegistrationGaps(),
    listTaxGaps(),
    listOpenUnlimitedRegistrations(),
    listPendingCompletionConfirmations(),
  ]);
  return [
    ...registrationGaps,
    ...taxGaps,
    ...openUnlimited,
    ...completionReminders,
  ];
}
