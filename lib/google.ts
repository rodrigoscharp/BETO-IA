import { NextRequest } from "next/server";

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface GmailHeader  { name: string; value: string }
export interface GmailMessage {
  id:       string;
  threadId: string;
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function gmailHeader(msg: GmailMessage, name: string): string {
  return (
    msg.payload?.headers
      ?.find(h => h.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

export function googleFetch(token: string, url: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
}

/* ── Token: reads gc_at cookie, refreshes via gc_rt if needed ───────────── */

export async function getGoogleToken(req: NextRequest): Promise<string | null> {
  const at = req.cookies.get("gc_at")?.value;
  if (at) return at;

  const rt = req.cookies.get("gc_rt")?.value;
  if (!rt) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      refresh_token: rt,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}
