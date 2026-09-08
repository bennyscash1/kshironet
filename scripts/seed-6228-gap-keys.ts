import { config } from "dotenv";
import { withTransaction, execute, query, queryOne } from "@/lib/db/client";
import { GAP_ROWS_6228, UNIT_COUNTS_6228, UNIT_NAMES, activeKeyOf } from "../tests/fixtures/battalion-6228";

config({ path: ".env.local" });

/**
 * Dev/test seed: requirement keys and manual unit counts for battalion 6228.
 *
 * Not a production path. Uses SET LOCAL app.seeding so the establishment-key lock lets
 * these rows through. Held counts are NOT written — they come from soldier_certifications
 * once a force-structure import exists; without one the gaps tab still renders keys and
 * required counts (held = 0).
 *
 *   npx tsx scripts/seed-6228-gap-keys.ts
 */
async function main() {
  const battalion = await queryOne<{ id: number }>(`SELECT id FROM battalions WHERE code = '6228'`);
  if (!battalion) {
    throw new Error("Battalion 6228 is not in battalions — seed aborted");
  }

  const families = await query<{ id: number; name: string }>(
    `SELECT id, name FROM certification_families`
  );
  const familyId = (name: string) => {
    const map: Record<string, string> = {
      drone: "רחפנים",
      drive: "נהיגה וניוד",
      arms: "נשק וחימוש",
      med: "רפואה",
      sys: "מכלול 750",
    };
    return families.find((f) => f.name === map[name])?.id ?? null;
  };

  await withTransaction(async (client) => {
    await execute(`SET LOCAL app.seeding = 'on'`, [], client);

    for (const [unitType, unitCount] of Object.entries(UNIT_COUNTS_6228)) {
      if (unitType === "team_all") continue;
      await execute(
        `INSERT INTO org_unit_manual_counts (battalion_id, unit_type, unit_count, note)
         VALUES ($1, $2, $3, '6228 fixture')
         ON CONFLICT (battalion_id, unit_type)
         DO UPDATE SET unit_count = EXCLUDED.unit_count, note = EXCLUDED.note`,
        [battalion.id, unitType, unitCount],
        client
      );
    }

    for (const row of GAP_ROWS_6228) {
      let gapRow = await queryOne<{ id: number }>(
        `SELECT id FROM certification_gap_rows WHERE certification_name = $1`,
        [row.name],
        client
      );
      if (!gapRow) {
        const inserted = await queryOne<{ id: number }>(
          `INSERT INTO certification_gap_rows (certification_name, family_id, canonical_cert_name, active_source, sort_order)
           VALUES ($1, $2, $1, $3, 0)
           RETURNING id`,
          [row.name, familyId(row.family), row.activeSource],
          client
        );
        gapRow = inserted;
      } else {
        await execute(
          `UPDATE certification_gap_rows
              SET family_id = COALESCE(family_id, $2),
                  canonical_cert_name = COALESCE(canonical_cert_name, $1),
                  active_source = $3
            WHERE id = $4`,
          [row.name, familyId(row.family), row.activeSource, gapRow.id],
          client
        );
      }
      if (!gapRow) continue;

      await execute(
        `INSERT INTO certification_gap_values (row_id, battalion_id, gap_count, sent_count, active_source)
         VALUES ($1, $2, 0, 0, $3)
         ON CONFLICT (row_id, battalion_id)
         DO UPDATE SET active_source = EXCLUDED.active_source`,
        [gapRow.id, battalion.id, row.activeSource],
        client
      );

      for (const source of ["establishment", "operational"] as const) {
        const lines = row.keys[source];
        if (!lines) continue;
        await execute(
          `DELETE FROM gap_requirement_keys
            WHERE gap_row_id = $1 AND battalion_id = $2 AND source = $3`,
          [gapRow.id, battalion.id, source],
          client
        );
        for (let i = 0; i < lines.length; i++) {
          await execute(
            `INSERT INTO gap_requirement_keys (gap_row_id, battalion_id, source, qty, unit_type, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [gapRow.id, battalion.id, source, lines[i].qty, lines[i].unitType, i],
            client
          );
        }
      }
    }
  });

  console.log(`Seeded ${GAP_ROWS_6228.length} requirement keys for battalion 6228.`);
  void UNIT_NAMES;
  void activeKeyOf;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
