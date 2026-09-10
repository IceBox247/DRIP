import { NextResponse } from "next/server";
import { sql, dbEnabled, ensureSchema } from "@/lib/db";

// Chat API — backs the /game/chat feed with Neon when DATABASE_URL is set. Without it, returns
// { enabled: false } and the client keeps its demo simulation.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const hueFor = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export async function GET() {
  if (!dbEnabled || !sql) return NextResponse.json({ enabled: false, messages: [] });
  try {
    await ensureSchema();
    const rows = await sql`
      SELECT id, name, hue, body, created_at
      FROM chat_messages ORDER BY id DESC LIMIT 60
    `;
    return NextResponse.json({ enabled: true, messages: rows.reverse() });
  } catch (e) {
    return NextResponse.json({ enabled: false, messages: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!dbEnabled || !sql) return NextResponse.json({ enabled: false }, { status: 503 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const p = payload as { name?: string; body?: string; addr?: string };
  const name = clean(p.name, 40) || "guest";
  const body = clean(p.body, 240);
  const addr = clean(p.addr, 64) || null;
  if (!body) return NextResponse.json({ error: "empty message" }, { status: 400 });
  try {
    await ensureSchema();
    const rows = await sql`
      INSERT INTO chat_messages (name, hue, body, addr)
      VALUES (${name}, ${hueFor(name)}, ${body}, ${addr})
      RETURNING id, name, hue, body, created_at
    `;
    return NextResponse.json({ enabled: true, message: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
