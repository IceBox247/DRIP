"use client";

// Tiny stale-while-revalidate cache backed by localStorage.
//
// Why: every on-chain hook used to reset to an empty object whenever the user navigated away and
// back (or refreshed), so the UI flashed zeros / "No settled rounds" / blank tiles for the 1-2s
// (sometimes much longer on a slow RPC) it took to reload. That reads as "the data zeroed out".
//
// With this helper a hook can (1) hydrate its initial state from the LAST known-good on-chain read
// so the user sees real numbers instantly, then (2) quietly revalidate in the background and persist
// the fresh result. Nothing here is a source of truth — it's only a warm cache of the chain.
//
// Everything is wrapped in try/catch and SSR-guarded: localStorage can be absent (server render),
// disabled (private mode), or throw (quota). A cache miss or failure simply falls back to the
// caller's default — it must never break a render.

const PREFIX = "drip.cache.";
const VERSION = 1; // bump to invalidate all cached shapes after a breaking change

type Entry<T> = { v: number; t: number; data: T };

/** Read the last cached value for `key`, or `fallback` if missing/expired/unreadable. */
export function readCache<T>(key: string, fallback: T, maxAgeMs = 24 * 60 * 60 * 1000): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const e = JSON.parse(raw) as Entry<T>;
    if (e.v !== VERSION) return fallback;
    if (maxAgeMs > 0 && Date.now() - e.t > maxAgeMs) return fallback;
    return e.data;
  } catch {
    return fallback;
  }
}

/** Persist `data` as the newest known-good value for `key`. Best-effort; failures are swallowed. */
export function writeCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const e: Entry<T> = { v: VERSION, t: Date.now(), data };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(e));
  } catch {
    /* quota / disabled — ignore, the cache is optional */
  }
}
