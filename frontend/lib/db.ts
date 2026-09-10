import { neon } from "@neondatabase/serverless";

// Neon Postgres connection. Server-only — never import this from a client component.
// When DATABASE_URL is unset (e.g. the demo deploy), `dbEnabled` is false and callers fall back to
// their demo behavior instead of hitting a database.
export const dbEnabled = !!process.env.DATABASE_URL;

export const sql = dbEnabled ? neon(process.env.DATABASE_URL as string) : null;

let ensured = false;
/** Create tables on first use so a fresh Neon project works with no manual migration step. */
export async function ensureSchema() {
  if (!sql || ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      hue        INTEGER NOT NULL DEFAULT 90,
      body       TEXT NOT NULL,
      addr       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  ensured = true;
}
