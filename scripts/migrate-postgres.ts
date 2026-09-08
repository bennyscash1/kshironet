import fs from "fs";
import path from "path";
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DIRECT_URL or DATABASE_URL in .env.local");
  process.exit(1);
}

async function main() {
  const dir = path.join(process.cwd(), "migrations", "postgres");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Connecting to Supabase Postgres...");
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query(sql);
      console.log(`Applied migrations/postgres/${file} successfully.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
