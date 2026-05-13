import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken, spotifyFetch } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const result = await getSpotifyToken(req);
  if (!result) return NextResponse.json({ playing: false });

  const res = await spotifyFetch(result.token, "GET", "/me/player/currently-playing");
  if (res.status === 204 || !res.ok) return NextResponse.json({ playing: false });

  const data = await res.json();
  if (!data?.item) return NextResponse.json({ playing: false });

  return NextResponse.json({
    playing:    data.is_playing,
    track:      data.item.name,
    artist:     data.item.artists?.map((a: { name: string }) => a.name).join(", "),
    albumArt:   data.item.album?.images?.[0]?.url ?? null,
    albumName:  data.item.album?.name ?? "",
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms ?? 0,
  });
}
