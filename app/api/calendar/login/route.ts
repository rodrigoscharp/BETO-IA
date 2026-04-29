import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google not configured" }, { status: 500 });

  const origin = process.env.GOOGLE_REDIRECT_URI
    ? process.env.GOOGLE_REDIRECT_URI.replace("/api/calendar/callback", "")
    : `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const redirectUri = `${origin}/api/calendar/callback`;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly",
    access_type:   "offline",
    prompt:        "consent",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
