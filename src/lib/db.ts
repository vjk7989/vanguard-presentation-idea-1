import "server-only";
import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required to use a room. Run the SQL migration first.");
    client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  }
  return client;
}
