import { neon } from "@neondatabase/serverless";

// Neon Postgres connection. Server-only — never import this from a client component.
// The Neon Vercel integration adds several connection-string vars; accept whichever one is present
// (prefer a pooled URL — the neon() HTTP client is happiest with the "-pooler" host). When none is
// set (e.g. the plain demo deploy), `dbEnabled` is false and callers fall back to demo behavior.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

export const dbEnabled = !!connectionString;

export const sql = dbEnabled ? neon(connectionString) : null;

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
