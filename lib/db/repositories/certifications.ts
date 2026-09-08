import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type {
  Certification,
  CertificationBattalionQuota,
  CertificationPrerequisite,
  CertificationStatus,
  CertificationTax,
  CertificationWithCounts,
} from "@/lib/types";
import { ACTIVE_ROSTER_STATUSES, computeSlotsRemaining } from "@/lib/utils/slots";
import { normalizeLockHour } from "@/lib/utils/registration-lock";
import { recordStatusChange } from "@/lib/db/repositories/audit";
import { VALID_TRANSITIONS } from "@/lib/certifications/transitions";
import { createNotification } from "@/lib/db/repositories/notifications";

export interface CertificationFilters {
  battalionCode?: string;
  status?: CertificationStatus;
  domain?: string;
  from?: string;
  to?: string;
}

async function withCounts(cert: Certification): Promise<CertificationWithCounts> {
  const placeholders = ACTIVE_ROSTER_STATUSES.map((_, index) => `$${index + 2}`).join(",");
  const registeredCount = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM roster_entries WHERE certification_id = $1 AND is_reserve = 0 AND status IN (${placeholders})`,
    [cert.id, ...ACTIVE_ROSTER_STATUSES]
  );
  return {
    ...cert,
    registered_count: registeredCount?.c ?? 0,
    slots_remaining: computeSlotsRemaining(cert.total_slots, registeredCount?.c ?? 0),
  };
}

export async function listCertifications(filters: CertificationFilters = {}): Promise<CertificationWithCounts[]> {
  let sql = `SELECT DISTINCT c.* FROM certifications c`;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.battalionCode) {
    sql += ` LEFT JOIN roster_entries re ON re.certification_id = c.id
              LEFT JOIN certification_battalion_quotas q ON q.certification_id = c.id
              LEFT JOIN battalions b_re ON b_re.id = re.battalion_id
              LEFT JOIN battalions b_q ON b_q.id = q.battalion_id`;
    conditions.push(`(b_re.code = $${params.length + 1} OR b_q.code = $${params.length + 2} OR c.registration_open = 1)`);
    params.push(filters.battalionCode, filters.battalionCode);
  }
  if (filters.status) {
    conditions.push(`c.status = $${params.length + 1}`);
    params.push(filters.status);
  }
  if (filters.domain) {
    conditions.push(`c.domain = $${params.length + 1}`);
    params.push(filters.domain);
  }
  if (filters.from) {
    conditions.push(`(c.end_date >= $${params.length + 1} OR (c.end_date IS NULL AND c.start_date >= $${params.length + 2}))`);
    params.push(filters.from, filters.from);
  }
  if (filters.to) {
    conditions.push(`c.start_date <= $${params.length + 1}`);
    params.push(filters.to);
  }

  if (conditions.length) {
    sql += ` WHERE ` + conditions.join(" AND ");
  }
  sql += ` ORDER BY c.start_date ASC`;

  const rows = await query<Certification>(sql, params);
  return Promise.all(rows.map(withCounts));
}

export async function getCertificationById(id: number): Promise<CertificationWithCounts | undefined> {
  const cert = await queryOne<Certification>("SELECT * FROM certifications WHERE id = $1", [id]);
  return cert ? withCounts(cert) : undefined;
}

export interface CertificationInput {
  template_id?: number | null;
  name: string;
  domain?: string | null;
  start_date: string;
  end_date?: string | null;
  location?: string | null;
  total_slots?: number | null;
  gap_row_id?: number | null;
  registration_open?: boolean;
  /** 'yyyy-MM-dd', or null for no deadline. One date for every battalion. */
  registration_lock_date?: string | null;
  /** Closing hour on that date, 0–23 Israel wall-clock. null = end of the lock day. */
  registration_lock_hour?: number | null;
  status?: CertificationStatus;
  notes?: string | null;
  origin_request_id?: number | null;
  created_by_role?: string;
  color_hex?: string | null;
}

/**
 * The lock date and hour as a coherent pair, ready for storage.
 *
 * ONE CHOKE POINT, and it exists because the two columns can disagree in a way neither
 * column can catch alone: an hour with no date is a deadline that no check enforces and no
 * screen shows. Clearing the date therefore clears the hour, always — every writer goes
 * through here rather than remembering to do it, and the CHECK in migration 022 is the
 * backstop if one ever does not.
 *
 * The hour is also re-normalized to a whole 0–23 (or null) here, so a value that bypassed
 * Zod — an internal caller, a seed script — still cannot land a fractional hour.
 */
function normalizeLockColumns(
  date: string | null | undefined,
  hour: number | null | undefined
): { date: string | null; hour: number | null } {
  const nextDate = date || null;
  return { date: nextDate, hour: nextDate === null ? null : normalizeLockHour(hour) };
}

export async function createCertification(input: CertificationInput, client?: PoolClient): Promise<number> {
  const status = input.status ?? (input.registration_open ? "open" : "draft");
  const lock = normalizeLockColumns(input.registration_lock_date, input.registration_lock_hour);
  const result = await execute(
    `INSERT INTO certifications
        (template_id, name, domain, start_date, end_date, location, total_slots, gap_row_id,
         registration_open, registration_lock_date, registration_lock_hour, status, notes,
         origin_request_id, created_by_role, color_hex)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id`,
    [
      input.template_id ?? null,
      input.name,
      input.domain ?? null,
      input.start_date,
      input.end_date || null,
      input.location ?? null,
      input.total_slots ?? null,
      input.gap_row_id ?? null,
      input.registration_open ? 1 : 0,
      lock.date,
      lock.hour,
      status,
      input.notes ?? null,
      input.origin_request_id ?? null,
      input.created_by_role ?? "brigade",
      input.color_hex ?? null,
    ],
    client
  );
  const id = (result.rows[0] as { id: number }).id;
  await recordStatusChange("certification", id, null, status, input.created_by_role ?? "brigade", "נוצרה הסמכה", client);
  return id;
}

export async function updateCertification(id: number, input: Partial<CertificationInput>) {
  const existing = await queryOne<Certification>("SELECT * FROM certifications WHERE id = $1", [id]);
  if (!existing) throw new Error("Certification not found");

  // The lock is resolved as a PAIR before the UPDATE, because "keep existing" has to be
  // decided per column but coherence has to be decided across both. Sending only a new
  // date must not leave yesterday's hour attached to it, and sending only an hour must not
  // invent a date — so each side falls back to the stored value, and the pair is then
  // normalized together (a cleared date takes its hour with it).
  const lock = normalizeLockColumns(
    input.registration_lock_date !== undefined
      ? input.registration_lock_date
      : existing.registration_lock_date,
    input.registration_lock_hour !== undefined
      ? input.registration_lock_hour
      : existing.registration_lock_hour
  );

  await execute(
    `UPDATE certifications SET
      name = $1, domain = $2, start_date = $3, end_date = $4, location = $5, total_slots = $6, gap_row_id = $7,
      registration_open = $8, registration_lock_date = $9, registration_lock_hour = $10,
      notes = $11, color_hex = $12,
      updated_at = NOW()
     WHERE id = $13`,
  [
    input.name ?? existing.name,
    input.domain ?? existing.domain,
    input.start_date ?? existing.start_date,
    input.end_date !== undefined ? input.end_date || null : existing.end_date,
    input.location ?? existing.location,
    // `undefined` = field not sent (keep existing); `null` = explicit "unlimited".
    input.total_slots !== undefined ? input.total_slots : existing.total_slots,
    input.gap_row_id !== undefined ? input.gap_row_id : existing.gap_row_id,
    input.registration_open !== undefined ? (input.registration_open ? 1 : 0) : existing.registration_open,
    // `undefined` = not sent (keep existing); `null` = explicitly cleared (no deadline).
    lock.date,
    lock.hour,
    input.notes ?? existing.notes,
    input.color_hex !== undefined ? input.color_hex : existing.color_hex,
    id,
  ]);
}

export async function deleteCertification(id: number) {
  await withTransaction(async (client) => {
    // Roster entries, quotas, prerequisites and taxes are removed automatically by
    // ON DELETE CASCADE, and battalion_requests.linked_certification_id is SET NULL.
    // But status_history and notifications are polymorphic (entity_type/entity_id,
    // no FK), so they must be cleaned up explicitly to avoid orphaned rows — both the
    // certification's own audit/notification rows and those of its roster entries.
    const rosterResult = await execute(
      "SELECT id FROM roster_entries WHERE certification_id = $1",
      [id],
      client
    );
    const rosterIds = (rosterResult.rows as { id: number }[]).map((r) => r.id);

    await execute(
      "DELETE FROM status_history WHERE entity_type = 'certification' AND entity_id = $1",
      [id],
      client
    );
    await execute(
      "DELETE FROM notifications WHERE entity_type = 'certification' AND entity_id = $1",
      [id],
      client
    );
    if (rosterIds.length > 0) {
      await execute(
        "DELETE FROM status_history WHERE entity_type = 'roster_entry' AND entity_id = ANY($1::int[])",
        [rosterIds],
        client
      );
      await execute(
        "DELETE FROM notifications WHERE entity_type = 'roster_entry' AND entity_id = ANY($1::int[])",
        [rosterIds],
        client
      );
    }

    await execute("DELETE FROM certifications WHERE id = $1", [id], client);
  });
}


export async function updateCertificationStatus(
  id: number,
  newStatus: CertificationStatus,
  changedByRole: string,
  note?: string
) {
  const existing = await queryOne<Certification>("SELECT * FROM certifications WHERE id = $1", [id]);
  if (!existing) throw new Error("Certification not found");

  const allowed = VALID_TRANSITIONS[existing.status] ?? [];
  if (existing.status !== newStatus && !allowed.includes(newStatus)) {
    throw new Error(`Invalid transition from ${existing.status} to ${newStatus}`);
  }

  await withTransaction(async (client) => {
    await execute(`UPDATE certifications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, id], client);
    await recordStatusChange("certification", id, existing.status, newStatus, changedByRole, note, client);

    const messages: Partial<Record<CertificationStatus, string>> = {
      open: `ההסמכה "${existing.name}" פתוחה להרשמה`,
      closed: `ההרשמה להסמכה "${existing.name}" נסגרה`,
      cancelled: `ההסמכה "${existing.name}" בוטלה`,
      completed: `ההסמכה "${existing.name}" הסתיימה`,
    };
    if (messages[newStatus]) {
      await createNotification({
        type:
          newStatus === "cancelled"
            ? "certification_cancelled"
            : newStatus === "closed"
            ? "registration_closed"
            : "certification_changed",
        target_role: "battalion:all",
        entity_type: "certification",
        entity_id: id,
        message: messages[newStatus]!,
      }, client);
    }
  });
}

/** Confirms which registered soldiers passed a certification that has ended: marks each
 * roster entry passed/failed, closes out the certification, and — if the certification is
 * linked to a gap-row profession — decrements each involved battalion's remaining gap by
 * how many of its soldiers passed. */
export async function confirmCertificationCompletion(
  certificationId: number,
  passedRosterIds: number[],
  changedByRole: string
) {
  const existing = await queryOne<Certification>("SELECT * FROM certifications WHERE id = $1", [certificationId]);
  if (!existing) throw new Error("Certification not found");
  if (existing.status === "completed" || existing.status === "cancelled") {
    throw new Error(`Certification already ${existing.status}`);
  }

  const passedSet = new Set(passedRosterIds);
  const entries = await query<{ id: number; battalion_id: number; status: string }>(
    "SELECT * FROM roster_entries WHERE certification_id = $1 AND is_reserve = 0", [certificationId]
  );

  await withTransaction(async (client) => {
    const passedByBattalion = new Map<number, number>();

    for (const entry of entries) {
      const newStatus = passedSet.has(entry.id) ? "passed" : "failed";
      await execute(`UPDATE roster_entries SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, entry.id], client);
      await recordStatusChange("roster_entry", entry.id, entry.status, newStatus, changedByRole, undefined, client);
      if (newStatus === "passed") {
        passedByBattalion.set(entry.battalion_id, (passedByBattalion.get(entry.battalion_id) ?? 0) + 1);
      }
    }

    if (existing.gap_row_id) {
      for (const [battalionId, passedCount] of passedByBattalion) {
        await execute(
          `UPDATE certification_gap_values SET gap_count = GREATEST(gap_count - $1, 0)
           WHERE row_id = $2 AND battalion_id = $3`,
          [passedCount, existing.gap_row_id, battalionId], client
        );
      }
    }

    await execute(`UPDATE certifications SET status = 'completed', updated_at = NOW() WHERE id = $1`, [certificationId], client);
    await recordStatusChange(
      "certification",
      certificationId,
      existing.status,
      "completed",
      changedByRole,
      "אושר סיום הסמכה ועודכנו פערים",
      client
    );
    await createNotification({
      type: "certification_changed",
      target_role: "battalion:all",
      entity_type: "certification",
      entity_id: certificationId,
      message: `ההסמכה "${existing.name}" הסתיימה ואושרה`,
    }, client);
  });
}

export async function listPrerequisites(certificationId: number): Promise<CertificationPrerequisite[]> {
  return query<CertificationPrerequisite>(
    "SELECT * FROM certification_prerequisites WHERE certification_id = $1", [certificationId]
  );
}

export async function replacePrerequisites(certificationId: number, descriptions: string[]) {
  await withTransaction(async (client) => {
    await execute("DELETE FROM certification_prerequisites WHERE certification_id = $1", [certificationId], client);
    for (const desc of descriptions) {
      if (desc.trim()) {
        await execute(
          "INSERT INTO certification_prerequisites (certification_id, description) VALUES ($1, $2)",
          [certificationId, desc.trim()],
          client
        );
      }
    }
  });
}

export interface CertBattalionColor {
  code: string;
  name: string;
  color_hex: string;
}

export async function getCertificationBattalions(certificationId: number): Promise<CertBattalionColor[]> {
  return query<CertBattalionColor>(
    `SELECT DISTINCT b.code, b.name, b.color_hex FROM battalions b
       WHERE b.id IN (
         SELECT battalion_id FROM certification_battalion_quotas WHERE certification_id = $1
         UNION
         SELECT battalion_id FROM roster_entries WHERE certification_id = $2
       )
       ORDER BY b.code`
    , [certificationId, certificationId]
  );
}

export async function listQuotas(certificationId: number): Promise<CertificationBattalionQuota[]> {
  return query<CertificationBattalionQuota>(
    "SELECT * FROM certification_battalion_quotas WHERE certification_id = $1 ORDER BY battalion_id", [certificationId]
  );
}

export async function getQuota(
  certificationId: number,
  battalionId: number
): Promise<CertificationBattalionQuota | undefined> {
  return queryOne<CertificationBattalionQuota>(
    "SELECT * FROM certification_battalion_quotas WHERE certification_id = $1 AND battalion_id = $2",
    [certificationId, battalionId]
  );
}

export async function replaceQuotas(
  certificationId: number,
  quotas: { battalion_id: number; allocated_slots: number; notes?: string }[]
) {
  await withTransaction(async (client) => {
    // Carry the DEPRECATED per-allocation `registration_lock_at` across the
    // delete+reinsert, keyed by battalion. Nothing enforces or edits that column any more —
    // migration 021 moved the deadline to `certifications.registration_lock_date` — but the
    // rewrite would otherwise destroy the historical values, and retention is the one thing
    // the consolidation promised not to break.
    const existing = await query<{ battalion_id: number; registration_lock_at: string | null }>(
      "SELECT battalion_id, registration_lock_at FROM certification_battalion_quotas WHERE certification_id = $1",
      [certificationId],
      client
    );
    const lockByBattalion = new Map(existing.map((q) => [q.battalion_id, q.registration_lock_at]));

    await execute("DELETE FROM certification_battalion_quotas WHERE certification_id = $1", [certificationId], client);
    for (const q of quotas) {
      await execute(
        `INSERT INTO certification_battalion_quotas (certification_id, battalion_id, allocated_slots, notes, registration_lock_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [certificationId, q.battalion_id, q.allocated_slots, q.notes ?? null, lockByBattalion.get(q.battalion_id) ?? null],
        client
      );
    }
  });
}

export async function listTaxes(certificationId: number): Promise<CertificationTax[]> {
  return query<CertificationTax>(
    "SELECT * FROM certification_taxes WHERE certification_id = $1 ORDER BY id", [certificationId]
  );
}

export async function replaceTaxes(
  certificationId: number,
  taxes: { role_name: string; is_fulfilled?: boolean; notes?: string }[]
) {
  await withTransaction(async (client) => {
    await execute("DELETE FROM certification_taxes WHERE certification_id = $1", [certificationId], client);
    for (const t of taxes) {
      if (!t.role_name.trim()) continue;
      await execute(
        `INSERT INTO certification_taxes (certification_id, role_name, is_fulfilled, notes)
         VALUES ($1, $2, $3, $4)`,
        [certificationId, t.role_name.trim(), t.is_fulfilled ? 1 : 0, t.notes ?? null],
        client
      );
    }
  });
}

export async function setTaxFulfilled(taxId: number, isFulfilled: boolean) {
  await execute("UPDATE certification_taxes SET is_fulfilled = $1 WHERE id = $2", [isFulfilled ? 1 : 0, taxId]);
}
