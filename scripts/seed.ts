import { config } from "dotenv";

config({ path: ".env.local" });

import { execute, withTransaction } from "../lib/db/client";

const battalions = [
  { code: "5030", name: "גדוד 5030", color_hex: "#C2410C" },
  { code: "8207", name: "גדוד 8207", color_hex: "#1D4ED8" },
  { code: "9308", name: "גדוד 9308", color_hex: "#7C3AED" },
  { code: "6228", name: "גדוד 6228", color_hex: "#15803D" },
  { code: "gdsm", name: "גדס״מ", color_hex: "#B45309" },
  { code: "hq", name: "מפקדת החטיבה", color_hex: "#0F766E" },
];

const codes = battalions.map((b) => b.code);

async function main() {
  await withTransaction(async (client) => {
    for (const b of battalions) {
      await execute(
        `INSERT INTO battalions (code, name, color_hex, is_active)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           color_hex = excluded.color_hex,
           is_active = 1`,
        [b.code, b.name, b.color_hex],
        client
      );
    }
    await execute(
      `UPDATE battalions SET is_active = 0 WHERE code NOT IN (${codes
        .map((_, index) => `$${index + 1}`)
        .join(",")})`,
      codes,
      client
    );
  });
  console.log(`Seeded ${battalions.length} battalions.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
