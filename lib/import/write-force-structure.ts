import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import type { ParsedCompany, ParsedReferenceRow, ParsedSoldier } from "@/lib/import/parse-workbook";
import type { Canonicalizer } from "@/lib/import/canonical";

/**
 * The write half of the force-structure import.
 *
 * Split from the parser and the CLI so that a dry run can produce its full report
 * without this module ever being loaded, and so the transaction boundaries below are
 * easy to audit.
 *
 * THE BOUNDARY THAT MATTERS: reference data (`companies`, `roles`, `role_reference`) and
 * people (`role_assignments`, `bank_soldiers`, `soldier_certifications`) are written in
 * SEPARATE transactions, per company. Spec §0.2 forbids any write path that touches both
 * `roles` and `role_assignments` in one transaction; if the importer did, it would be the
 * one place in the system that contradicts the rule everything else is held to.
 */

export interface WriteResult {
  companies: number;
  roles: number;
  assignments: number;
  bank: number;
  certifications: number;
}

async function battalionIdByCode(code: string): Promise<number> {
  const row = await queryOne<{ id: number } & Record<string, unknown>>(
    `SELECT id FROM battalions WHERE code = $1`,
    [code]
  );
  // Never create a battalion implicitly: a folder whose name does not match a known
  // battalion is far more likely to be a typo than a new unit.
  if (!row) throw new Error(`גדוד "${code}" אינו קיים בטבלת battalions — ייבוא נעצר`);
  return row.id;
}

/** Reference data for one company. Opens with SET LOCAL app.seeding so the establishment
 * lock in migration 015 lets the seeding path through; the setting is transaction-scoped,
 * so it cannot leak to any other connection or statement. */
async function writeCompanyReference(
  company: ParsedCompany,
  battalionId: number
): Promise<{ companyId: number; roles: number }> {
  return withTransaction(async (client) => {
    await execute(`SET LOCAL app.seeding = 'on'`, [], client);

    const companyRow = await queryOne<{ id: number } & Record<string, unknown>>(
      `INSERT INTO companies (battalion_id, code, name, kind, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (battalion_id, code) DO UPDATE SET
         name = excluded.name,
         kind = excluded.kind,
         sort_order = excluded.sort_order
       RETURNING id`,
      [battalionId, company.code, company.name, company.kind, company.kind === "support" ? 99 : 0],
      client
    );
    const companyId = companyRow!.id;

    for (const role of company.roles) {
      await execute(
        `INSERT INTO roles (
           company_id, department, squad, serial, role_name,
           req1, req2, req3, dept_sort, squad_sort, row_sort
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (company_id, serial) DO UPDATE SET
           department = excluded.department,
           squad = excluded.squad,
           role_name = excluded.role_name,
           req1 = excluded.req1,
           req2 = excluded.req2,
           req3 = excluded.req3,
           dept_sort = excluded.dept_sort,
           squad_sort = excluded.squad_sort,
           row_sort = excluded.row_sort`,
        [
          companyId,
          role.department,
          role.squad,
          role.serial,
          role.roleName,
          role.req1,
          role.req2,
          role.req3,
          role.deptSort,
          role.squadSort,
          role.rowSort,
        ],
        client
      );
    }

    return { companyId, roles: company.roles.length };
  });
}

async function writeHeldCertifications(
  soldier: ParsedSoldier,
  resolver: Canonicalizer,
  client: Parameters<Parameters<typeof withTransaction>[0]>[0]
): Promise<number> {
  // Held certifications are keyed by personal number. With none, there is nothing to
  // attach them to — the certifications are reported by the dry run and not stored.
  if (soldier.personalNumber === null) return 0;

  let written = 0;
  for (const cert of soldier.certifications) {
    const canonical = resolver.resolve(cert.raw);
    if (!canonical) continue; // quarantined — reported by the dry run, never stored
    const result = await execute(
      `INSERT INTO soldier_certifications (personal_number, certification_name, raw_name, source)
       VALUES ($1, $2, $3, 'import')
       ON CONFLICT (personal_number, certification_name) DO NOTHING`,
      [soldier.personalNumber, canonical, cert.raw],
      client
    );
    written += result.rowCount;
  }
  return written;
}

/** People for one company: assignments, bank, and the certifications they hold.
 * A separate transaction from the reference write above — deliberately. */
async function writeCompanyPeople(
  company: ParsedCompany,
  companyId: number,
  resolver: Canonicalizer
): Promise<{ assignments: number; bank: number; certifications: number }> {
  return withTransaction(async (client) => {
    const serialToRoleId = new Map<string, number>(
      (
        await query<{ id: number; serial: string } & Record<string, unknown>>(
          `SELECT id, serial FROM roles WHERE company_id = $1`,
          [companyId],
          client
        )
      ).map((r) => [r.serial, r.id])
    );

    let assignments = 0;
    let certifications = 0;

    for (const role of company.roles) {
      const soldier = role.assignment;
      if (!soldier) continue;
      const roleId = serialToRoleId.get(role.serial);
      if (roleId === undefined) continue;

      // Pending identity is stored as NULL plus a flag, never as a placeholder number: the
      // personal number is the join key for held certifications and every soldier lookup,
      // so a repeated placeholder would resolve to the wrong person without erroring.
      await execute(
        `INSERT INTO role_assignments (
           role_id, full_name, personal_number, is_posted, pending_pn, pending_name
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (role_id) DO UPDATE SET
           full_name = excluded.full_name,
           personal_number = excluded.personal_number,
           is_posted = excluded.is_posted,
           pending_pn = excluded.pending_pn,
           pending_name = excluded.pending_name`,
        [
          roleId,
          soldier.fullName,
          soldier.personalNumber,
          role.isPosted ? 1 : 0,
          soldier.pendingPn ? 1 : 0,
          soldier.pendingName ? 1 : 0,
        ],
        client
      );
      assignments += 1;
      certifications += await writeHeldCertifications(soldier, resolver, client);
    }

    let bank = 0;
    for (const soldier of company.bank) {
      // ON CONFLICT cannot help a NULL personal number (NULLs are distinct), so a pending
      // bank soldier is matched on the company and name instead. Without this the row
      // would be duplicated on every re-import.
      if (soldier.personalNumber === null) {
        await execute(
          `INSERT INTO bank_soldiers (company_id, department, full_name, personal_number, note, pending_pn)
           SELECT $1, $2, $3, NULL, $4, 1
            WHERE NOT EXISTS (
              SELECT 1 FROM bank_soldiers
               WHERE company_id = $1 AND personal_number IS NULL AND full_name = $3
            )`,
          [companyId, soldier.department, soldier.fullName, soldier.note],
          client
        );
      } else {
        await execute(
          `INSERT INTO bank_soldiers (company_id, department, full_name, personal_number, note, pending_pn)
           VALUES ($1, $2, $3, $4, $5, 0)
           ON CONFLICT (company_id, personal_number) DO UPDATE SET
             department = excluded.department,
             full_name = excluded.full_name,
             note = excluded.note`,
          [companyId, soldier.department, soldier.fullName, soldier.personalNumber, soldier.note],
          client
        );
      }
      bank += 1;
      certifications += await writeHeldCertifications(soldier, resolver, client);
    }

    return { assignments, bank, certifications };
  });
}

/** The establishment reference table, stored so the dry-run diff can run against the
 * database rather than re-reading the workbook. Seeding path — reference data only. */
async function writeReferenceTable(rows: ParsedReferenceRow[]): Promise<void> {
  await withTransaction(async (client) => {
    await execute(`SET LOCAL app.seeding = 'on'`, [], client);
    for (const row of rows) {
      await execute(
        `INSERT INTO role_reference (company_kind, department, serial, role_name, req1, req2, req3, provenance)
         VALUES ('rifle', $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (company_kind, serial) DO UPDATE SET
           department = excluded.department,
           role_name = excluded.role_name,
           req1 = excluded.req1,
           req2 = excluded.req2,
           req3 = excluded.req3,
           provenance = excluded.provenance`,
        [row.department, row.serial, row.roleName, row.req1, row.req2, row.req3, row.provenance],
        client
      );
    }
  });
}

export async function writeImport(
  companies: ParsedCompany[],
  referenceRows: ParsedReferenceRow[],
  resolver: Canonicalizer
): Promise<WriteResult> {
  await writeReferenceTable(referenceRows);

  const result: WriteResult = { companies: 0, roles: 0, assignments: 0, bank: 0, certifications: 0 };
  const battalionIds = new Map<string, number>();

  for (const company of companies) {
    let battalionId = battalionIds.get(company.battalionCode);
    if (battalionId === undefined) {
      battalionId = await battalionIdByCode(company.battalionCode);
      battalionIds.set(company.battalionCode, battalionId);
    }

    const { companyId, roles } = await writeCompanyReference(company, battalionId);
    const people = await writeCompanyPeople(company, companyId, resolver);

    result.companies += 1;
    result.roles += roles;
    result.assignments += people.assignments;
    result.bank += people.bank;
    result.certifications += people.certifications;
  }

  return result;
}
