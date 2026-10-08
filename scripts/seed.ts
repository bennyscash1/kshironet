import { config } from "dotenv";

config({ path: ".env.local" });

import { execute, queryOne, withTransaction } from "../lib/db/client";

/**
 * Seeds one brigade's battalions.
 *
 *   npm run seed -- --brigade 1
 *   npm run seed -- --brigade-name "228 - חטיבת אלון"
 *
 * A TARGET BRIGADE IS REQUIRED, and this is a data-loss fix rather than a convenience.
 *
 * The deactivating sweep at the end of this script used to be
 *   UPDATE battalions SET is_active = 0 WHERE code NOT IN (...)
 * with no brigade predicate. Since migration 026 made battalions brigade-scoped, that
 * statement would have deactivated EVERY OTHER BRIGADE'S battalions on the next run —
 * silently, because deactivation is a flag rather than a delete and nothing reports it.
 * Both statements below are now scoped to a single brigade, and the script refuses to run
 * without one.
 */

const battalions = [
  { code: "5030", name: "גדוד 5030", color_hex: "#C2410C" },
  { code: "8207", name: "גדוד 8207", color_hex: "#1D4ED8" },
  { code: "9308", name: "גדוד 9308", color_hex: "#7C3AED" },
  { code: "6228", name: "גדוד 6228", color_hex: "#15803D" },
  { code: "gdsm", name: "גדס״מ", color_hex: "#B45309" },
  { code: "hq", name: "מפקדת החטיבה", color_hex: "#0F766E" },
];

const codes = battalions.map((b) => b.code);

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function usage(problem: string): never {
  console.error(
    [
      problem,
      "",
      "Usage:",
      '  npm run seed -- --brigade <id>',
      '  npm run seed -- --brigade-name "<name>"',
      "",
      "A brigade is required: this script deactivates any battalion in the target brigade",
      "that is not listed above, and running it unscoped would deactivate other brigades'",
      "battalions too.",
    ].join("\n")
  );
  process.exit(1);
}

/** Resolves the target brigade from --brigade or --brigade-name, or exits. */
async function resolveBrigadeId(): Promise<number> {
  const rawId = argValue("--brigade");
  const rawName = argValue("--brigade-name");

  if (rawId === undefined && rawName === undefined) {
    usage("No target brigade given.");
  }

  if (rawId !== undefined) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) usage(`--brigade must be a positive integer, got "${rawId}".`);
    const row = await queryOne<{ id: number }>("SELECT id FROM brigades WHERE id = $1", [id]);
    if (!row) usage(`No brigade with id ${id}.`);
    return row.id;
  }

  const row = await queryOne<{ id: number }>(
    "SELECT id FROM brigades WHERE name = $1",
    [rawName!.trim()]
  );
  if (!row) usage(`No brigade named "${rawName}".`);
  return row.id;
}

async function main() {
  const brigadeId = await resolveBrigadeId();

  await withTransaction(async (client) => {
    for (const b of battalions) {
      await execute(
        `INSERT INTO battalions (brigade_id, code, name, color_hex, is_active)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (brigade_id, code) DO UPDATE SET
           name = excluded.name, color_hex = excluded.color_hex, is_active = 1`,
        [brigadeId, b.code, b.name, b.color_hex],
        client
      );
    }

    // Scoped to the target brigade. Without the brigade_id predicate this sweep is a
    // cross-tenant data-loss bug — see the header.
    await execute(
      `UPDATE battalions SET is_active = 0
        WHERE brigade_id = $1
          AND code NOT IN (${codes.map((_, index) => `$${index + 2}`).join(",")})`,
      [brigadeId, ...codes],
      client
    );
  });

  console.log(`Seeded ${battalions.length} battalions into brigade ${brigadeId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
