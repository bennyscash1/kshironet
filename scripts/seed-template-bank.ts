import { config } from "dotenv";

config({ path: ".env.local" });

import { execute, query, queryOne } from "../lib/db/client";
import { createTemplate } from "../lib/db/repositories/templates";
import { addGapRow, listGapRows } from "../lib/db/repositories/certification-gaps";

const templates = [
  { name: "נהג האמר", domain: "נהיגה", default_slots: 12, default_location: "מתקן החטיבה" },
  { name: "מפעיל רחפן", domain: "מודיעין", default_slots: 8, default_location: 'שטח בא"פ' },
  { name: "קשר גדודי", domain: "קשר ותקשוב", default_slots: 10, default_location: "אליקים" },
  { name: 'מקלען', domain: 'חי"ר', default_slots: 16, default_location: "מטווח" },
  { name: "צלף", domain: 'חי"ר', default_slots: 6, default_location: "מטווח מתקדם" },
];

async function main() {
  const existing = await query<{ name: string }>("SELECT name FROM certification_templates");
  const existingNames = new Set(existing.map((t) => t.name));
  const gapRows = await listGapRows();
  const gapByName = new Map(gapRows.map((r) => [r.certification_name, r.id]));
  let created = 0;

  for (const t of templates) {
    if (existingNames.has(t.name)) continue;
    let gapRowId = gapByName.get(t.name);
    if (!gapRowId) {
      gapRowId = await addGapRow(t.name);
      gapByName.set(t.name, gapRowId);
      const row = await queryOne<{ id: number }>(
        "SELECT id FROM certification_templates WHERE name = $1 LIMIT 1",
        [t.name]
      );
      if (row) {
        await execute(
          `UPDATE certification_templates SET
             domain = $1, default_location = $2, default_slots = $3, gap_row_id = $4,
             updated_at = NOW()
           WHERE id = $5`,
          [t.domain, t.default_location, t.default_slots, gapRowId, row.id]
        );
        created++;
        continue;
      }
    }
    await createTemplate({
      name: t.name,
      domain: t.domain,
      default_location: t.default_location,
      default_slots: t.default_slots,
      gap_row_id: gapRowId,
    });
    created++;
  }

  console.log(`Seeded ${created} templates into the bank.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
