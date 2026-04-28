import { NextRequest, NextResponse } from "next/server";

async function getValidToken(req: NextRequest): Promise<string | null> {
  const at = req.cookies.get("sp_at")?.value;
  if (at) return at;

  const rt = req.cookies.get("sp_rt")?.value;
  if (!rt) return null;

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

  if (!res.ok) return null;
  const d = await res.json();
  return d.access_token;
}

export async function GET(req: NextRequest) {
  const token = await getValidToken(req);
  if (!token) return NextResponse.json({ playing: false }, { status: 200 });

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 204 || !res.ok) return NextResponse.json({ playing: false });

  const d = await res.json();
  if (!d?.item) return NextResponse.json({ playing: false });

  return NextResponse.json({
    playing:     d.is_playing,
    track:       d.item.name,
    artist:      d.item.artists?.map((a: { name: string }) => a.name).join(", "),
    albumArt:    d.item.album?.images?.[0]?.url ?? null,
    albumName:   d.item.album?.name ?? "",
    progressMs:  d.progress_ms ?? 0,
    durationMs:  d.item.duration_ms ?? 0,
  });
}
