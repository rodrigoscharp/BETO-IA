import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  let at = req.cookies.get("sp_at")?.value;

  if (!at) {
    const rt = req.cookies.get("sp_rt")?.value;
    if (!rt) return NextResponse.json({ error: "not_connected" }, { status: 401 });

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt }),
    });

    if (!res.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    const d = await res.json();
    at = d.access_token;

    const response = NextResponse.json({ token: at });
    response.cookies.set("sp_at", at!, {
      httpOnly: true, path: "/", maxAge: d.expires_in, sameSite: "lax",
    });
    return response;
  }

  return NextResponse.json({ token: at });
}
