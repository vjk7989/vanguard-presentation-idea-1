import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL before running the migration.");
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync(resolve("db/001_initial.sql"), "utf8"));
  console.log("Database migration complete.");
} finally {
  await sql.end();
}
