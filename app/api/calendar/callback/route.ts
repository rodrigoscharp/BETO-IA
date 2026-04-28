import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "No code" }, { status: 400 });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  `${req.nextUrl.protocol}//${req.nextUrl.host}/api/calendar/callback`,
      grant_type:    "authorization_code",
    }),
  });

  if (!res.ok) return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });

  const d = await res.json();
  const response = NextResponse.redirect(new URL("/?calendar=ok", req.url));

  response.cookies.set("gc_at", d.access_token, {
    httpOnly: true, path: "/", maxAge: d.expires_in ?? 3600, sameSite: "lax", secure: true,
  });
  if (d.refresh_token) {
    response.cookies.set("gc_rt", d.refresh_token, {
      httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: true,
    });
  }

  return response;
}
