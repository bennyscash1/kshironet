import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import type { CertificationTemplate } from "@/lib/types";
import { paletteColorAt } from "@/lib/utils/cert-colors";

export async function listTemplates(): Promise<CertificationTemplate[]> {
  return query<CertificationTemplate>("SELECT * FROM certification_templates ORDER BY name ASC");
}

/** Maps course name -> assigned color, for coloring every instance of a course
 * consistently across the calendar views. */
export async function getCourseColorMap(): Promise<Map<string, string>> {
  const rows = await query<{ name: string; color_hex: string }>(
    "SELECT name, color_hex FROM certification_templates WHERE color_hex IS NOT NULL"
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.name)) map.set(row.name, row.color_hex);
  }
  return map;
}

/** Reuses the color already assigned to another variant of the same course name,
 * or hands out the next unused slot in the distinct-color palette. */
async function resolveColorForName(name: string): Promise<string> {
  const existing = await queryOne<{ color_hex: string }>(
    "SELECT color_hex FROM certification_templates WHERE name = $1 AND color_hex IS NOT NULL LIMIT 1",
    [name]
  );
  if (existing) return existing.color_hex;

  const { count } = (await queryOne<{ count: number }>(
    "SELECT COUNT(DISTINCT color_hex)::int as count FROM certification_templates WHERE color_hex IS NOT NULL"
  ))!;
  return paletteColorAt(count);
}

export async function getTemplate(id: number): Promise<CertificationTemplate | undefined> {
  return queryOne<CertificationTemplate>("SELECT * FROM certification_templates WHERE id = $1", [id]);
}

export async function listTemplatesByName(name: string): Promise<CertificationTemplate[]> {
  return query<CertificationTemplate>("SELECT * FROM certification_templates WHERE name = $1 ORDER BY id ASC", [name]);
}

export interface TemplateInput {
  name: string;
  domain?: string | null;
  default_location?: string | null;
  default_slots?: number | null;
  gap_row_id?: number | null;
  default_notes?: string | null;
  checkin_details?: string | null;
  duration_text?: string | null;
  trainee_ratio?: string | null;
  ammo_required?: string | null;
  requirements_text?: string | null;
  equipment_text?: string | null;
  contacts_text?: string | null;
}

export async function createTemplate(input: TemplateInput): Promise<number> {
  const result = await execute(
    `INSERT INTO certification_templates
        (name, domain, default_location, default_slots, gap_row_id, default_notes,
         checkin_details, duration_text, trainee_ratio, ammo_required, requirements_text, equipment_text, contacts_text,
         color_hex)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
    [
      input.name,
      input.domain ?? null,
      input.default_location ?? null,
      input.default_slots ?? null,
      input.gap_row_id ?? null,
      input.default_notes ?? null,
      input.checkin_details ?? null,
      input.duration_text ?? null,
      input.trainee_ratio ?? null,
      input.ammo_required ?? null,
      input.requirements_text ?? null,
      input.equipment_text ?? null,
      input.contacts_text ?? null,
      await resolveColorForName(input.name),
    ]
  );
  return (result.rows[0] as { id: number }).id;
}

export async function updateTemplate(id: number, input: Partial<TemplateInput>) {
  const existing = await getTemplate(id);
  if (!existing) throw new Error("Template not found");
  await execute(
    `UPDATE certification_templates SET
      name = $1, domain = $2, default_location = $3, default_slots = $4, gap_row_id = $5, default_notes = $6,
      checkin_details = $7, duration_text = $8, trainee_ratio = $9, ammo_required = $10, requirements_text = $11,
      equipment_text = $12, contacts_text = $13,
      updated_at = NOW()
     WHERE id = $14`,
    [
      input.name ?? existing.name,
      input.domain ?? existing.domain,
      input.default_location ?? existing.default_location,
      input.default_slots ?? existing.default_slots,
      input.gap_row_id !== undefined ? input.gap_row_id : existing.gap_row_id,
      input.default_notes ?? existing.default_notes,
      input.checkin_details ?? existing.checkin_details,
      input.duration_text ?? existing.duration_text,
      input.trainee_ratio ?? existing.trainee_ratio,
      input.ammo_required ?? existing.ammo_required,
      input.requirements_text ?? existing.requirements_text,
      input.equipment_text ?? existing.equipment_text,
      input.contacts_text ?? existing.contacts_text,
      id,
    ]
  );
}

export async function deleteTemplate(id: number) {
  await execute("DELETE FROM certification_templates WHERE id = $1", [id]);
}

/** Renames a course (bulk-applies a new name/domain across every location variant sharing the
 * old name), and keeps the certification_gap_rows link in sync so the "פערי הסמכות" table's
 * link to the bank still resolves correctly after the rename. */
export async function renameCourse(oldName: string, newName: string, domain: string | null) {
  await withTransaction(async (client) => {
    await execute(
      `UPDATE certification_templates SET name = $1, domain = $2, updated_at = NOW() WHERE name = $3`,
      [newName, domain, oldName],
      client
    );
    if (newName !== oldName) {
      await execute(
        `UPDATE certification_gap_rows SET certification_name = $1 WHERE certification_name = $2`,
        [newName, oldName],
        client
      );
    }
  });
}
