import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const result = await getSpotifyToken(req);
  if (!result) return NextResponse.json({ error: "not_connected" }, { status: 401 });

  const response = NextResponse.json({ token: result.token });
  if (result.newToken) {
    response.cookies.set("sp_at", result.newToken, {
      httpOnly: true, path: "/", maxAge: result.expiresIn ?? 3600, sameSite: "lax",
    });
  }
  return response;
}
