import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken, spotifyFetch, spotifyError } from "@/lib/spotify";

/* ── Track search ────────────────────────────────────────────────────────── */

async function searchTrack(token: string, query: string) {
  const clean = query
    .replace(/^(toca|coloca|bota|me toca|quero ouvir|põe|pe)\s+/i, "")
    .trim();

  const res  = await spotifyFetch(token, "GET",
    `/search?q=${encodeURIComponent(clean)}&type=track,artist&limit=5&market=BR`
  );
  const data = await res.json();
  const tracks: Array<{ name: string; uri: string; artists: Array<{ name: string }> }> =
    data.tracks?.items ?? [];

  if (!tracks.length) return null;
  const exact = tracks.find(t => t.name.toLowerCase() === clean.toLowerCase());
  return exact ?? tracks[0];
}

/* ── POST /api/spotify/command ───────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const tokenResult = await getSpotifyToken(req);
  if (!tokenResult) return NextResponse.json({ needsLogin: true }, { status: 401 });

  const { token } = tokenResult;
  const { action, query, level, device_id, uri: playUri } = await req.json();
  const deviceParam = device_id ? `?device_id=${device_id}` : "";

  let result: object = { ok: true };

  try {
    switch (action) {
      case "play": {
        if (query) {
          if (/playlist/i.test(query)) {
            const clean = query.replace(/playlist\s*/i, "").trim();
            const res   = await spotifyFetch(token, "GET",
              `/search?q=${encodeURIComponent(clean)}&type=playlist&limit=3&market=BR`);
            const data  = await res.json();
            const item  = data.playlists?.items?.[0];
            if (!item) { result = { error: "Playlist não encontrada." }; break; }
            result = { ok: true, spotifyUri: item.uri, name: item.name };

          } else if (/\bartista\b|\bartist\b/i.test(query)) {
            const clean = query.replace(/\bartista\s*/i, "").trim();
            const res   = await spotifyFetch(token, "GET",
              `/search?q=${encodeURIComponent(clean)}&type=artist&limit=3&market=BR`);
            const data  = await res.json();
            const item  = data.artists?.items?.[0];
            if (!item) { result = { error: "Artista não encontrado." }; break; }
            result = { ok: true, spotifyUri: item.uri, name: item.name };

          } else {
            const track = await searchTrack(token, query);
            if (!track) { result = { error: "Música não encontrada." }; break; }
            result = { ok: true, spotifyUri: track.uri, track: track.name, artist: track.artists?.[0]?.name };
          }
        } else {
          const r   = await spotifyFetch(token, "PUT", `/me/player/play${deviceParam}`);
          const err = await spotifyError(r);
          if (err) result = { error: err };
        }
        break;
      }

      case "pause": {
        const r   = await spotifyFetch(token, "PUT", "/me/player/pause");
        const err = await spotifyError(r);
        if (err) result = { error: err };
        break;
      }

      case "resume": {
        const r   = await spotifyFetch(token, "PUT", `/me/player/play${deviceParam}`);
        const err = await spotifyError(r);
        if (err) result = { error: err };
        break;
      }

      case "next": {
        const r   = await spotifyFetch(token, "POST", "/me/player/next");
        const err = await spotifyError(r);
        if (err) result = { error: err };
        break;
      }

      case "previous": {
        const r   = await spotifyFetch(token, "POST", "/me/player/previous");
        const err = await spotifyError(r);
        if (err) result = { error: err };
        break;
      }

      case "volume": {
        const pct = Math.min(100, Math.max(0, Number(level) || 50));
        const r   = await spotifyFetch(token, "PUT", `/me/player/volume?volume_percent=${pct}`);
        const err = await spotifyError(r);
        if (err) result = { error: err };
        break;
      }

      case "shuffle": {
        const r   = await spotifyFetch(token, "PUT", "/me/player/shuffle?state=true");
        const err = await spotifyError(r);
        if (err) result = { error: err };
        break;
      }

      case "current": {
        const res = await spotifyFetch(token, "GET", "/me/player/currently-playing");
        if (res.status === 204) { result = { playing: false }; break; }
        const err = await spotifyError(res);
        if (err) { result = { error: err }; break; }
        const data = await res.json();
        result = { playing: data.is_playing, track: data.item?.name, artist: data.item?.artists?.[0]?.name };
        break;
      }

      case "play_uri": {
        if (!playUri) { result = { ok: false }; break; }
        const devRes = await spotifyFetch(token, "GET", "/me/player/devices");
        if (devRes.ok) {
          const devData = await devRes.json();
          type SpDev = { id: string; name: string; is_active: boolean };
          const devices: SpDev[] = (devData.devices ?? []).filter((d: SpDev) => d.name !== "Jarvis");
          const device = devices.find(d => d.is_active) ?? devices[0];
          if (device) {
            const body = playUri.startsWith("spotify:track:") ? { uris: [playUri] } : { context_uri: playUri };
            const r    = await spotifyFetch(token, "PUT", `/me/player/play?device_id=${device.id}`, body);
            result = { ok: r.ok || r.status === 204 };
            break;
          }
        }
        result = { ok: false };
        break;
      }

      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (err) {
    console.error("[Spotify command]", err);
    return NextResponse.json({ error: "Erro ao conectar com o Spotify." }, { status: 500 });
  }

  const response = NextResponse.json(result);
  if (tokenResult.newToken) {
    response.cookies.set("sp_at", tokenResult.newToken, {
      httpOnly: true, path: "/", maxAge: tokenResult.expiresIn ?? 3600, sameSite: "lax",
    });
  }
  return response;
}
