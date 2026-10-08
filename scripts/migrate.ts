import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL before running the migration.");
const sql = postgres(url, { prepare: false, max: 1 });
try {
  for (const file of readdirSync(resolve("db")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    await sql.unsafe(readFileSync(resolve("db", file), "utf8"));
    console.log(`Applied ${file}.`);
  }
  console.log("Database migrations complete.");
} finally {
  await sql.end();
}
