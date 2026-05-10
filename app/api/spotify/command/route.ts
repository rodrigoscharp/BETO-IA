import { NextRequest, NextResponse } from "next/server";

type TokenResult = { token: string; newToken?: string; expiresIn?: number };

async function getValidToken(req: NextRequest): Promise<TokenResult | null> {
  const at = req.cookies.get("sp_at")?.value;
  if (at) return { token: at };

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
  const data = await res.json();
  return { token: data.access_token, newToken: data.access_token, expiresIn: data.expires_in };
}

async function sp(token: string, method: string, path: string, body?: object) {
  return fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function spError(res: Response): Promise<string | null> {
  if (res.ok || res.status === 204) return null;
  if (res.status === 403) return "Esse recurso exige Spotify Premium.";
  if (res.status === 404) return "Nenhum dispositivo ativo. Tente novamente.";
  if (res.status === 429) return "Muitas requisições ao Spotify. Aguarde um momento.";
  try {
    const d = await res.json();
    const msg = (d?.error?.message as string | undefined)?.toLowerCase() ?? "";
    if (msg.includes("no active device")) return "Nenhum dispositivo ativo. Tente novamente.";
    if (msg.includes("premium"))          return "Esse recurso exige Spotify Premium.";
  } catch { /* ignore */ }
  return `Erro do Spotify (${res.status}).`;
}

/* Smart search: tries track+artist search, picks closest name match */
async function searchTrack(token: string, query: string) {
  // strip common Portuguese command prefixes
  const clean = query
    .replace(/^(toca|coloca|bota|me toca|quero ouvir|põe|pe)\s+/i, "")
    .trim();

  const res = await sp(token, "GET",
    `/search?q=${encodeURIComponent(clean)}&type=track,artist&limit=5&market=BR`
  );
  const d = await res.json();
  const tracks: Array<{ name: string; uri: string; artists: Array<{ name: string }> }> =
    d.tracks?.items ?? [];

  if (!tracks.length) return null;

  // prefer exact name match (case-insensitive), otherwise take first
  const lq = clean.toLowerCase();
  const exact = tracks.find(t => t.name.toLowerCase() === lq);
  return exact ?? tracks[0];
}

export async function POST(req: NextRequest) {
  const tokenResult = await getValidToken(req);
  if (!tokenResult) return NextResponse.json({ needsLogin: true }, { status: 401 });

  const { token } = tokenResult;
  const { action, query, level, device_id } = await req.json();
  const deviceParam = device_id ? `?device_id=${device_id}` : "";

  let result: object = { ok: true };

  try {
    switch (action) {
      case "play": {
        if (query) {
          const isPlaylist = /playlist/i.test(query);
          const isArtist   = /\bartista\b|\bartist\b/i.test(query);

          if (isPlaylist) {
            const clean = query.replace(/playlist\s*/i, "").trim();
            const res = await sp(token, "GET",
              `/search?q=${encodeURIComponent(clean)}&type=playlist&limit=3&market=BR`);
            const sd = await res.json();
            const item = sd.playlists?.items?.[0];
            if (!item) { result = { error: "Playlist não encontrada." }; break; }
            result = { ok: true, spotifyUri: item.uri, name: item.name };

          } else if (isArtist) {
            const clean = query.replace(/\bartista\s*/i, "").trim();
            const res = await sp(token, "GET",
              `/search?q=${encodeURIComponent(clean)}&type=artist&limit=3&market=BR`);
            const sd = await res.json();
            const item = sd.artists?.items?.[0];
            if (!item) { result = { error: "Artista não encontrado." }; break; }
            result = { ok: true, spotifyUri: item.uri, name: item.name };

          } else {
            const track = await searchTrack(token, query);
            if (!track) { result = { error: "Música não encontrada." }; break; }
            result = { ok: true, spotifyUri: track.uri, track: track.name, artist: track.artists?.[0]?.name };
          }
        } else {
          const r = await sp(token, "PUT", `/me/player/play${deviceParam}`);
          const err = await spError(r);
          if (err) result = { error: err };
        }
        break;
      }

      case "pause": {
        const r = await sp(token, "PUT", "/me/player/pause");
        const err = await spError(r);
        if (err) result = { error: err };
        break;
      }

      case "resume": {
        const r = await sp(token, "PUT", `/me/player/play${deviceParam}`);
        const err = await spError(r);
        if (err) result = { error: err };
        break;
      }

      case "next": {
        const r = await sp(token, "POST", "/me/player/next");
        const err = await spError(r);
        if (err) result = { error: err };
        break;
      }

      case "previous": {
        const r = await sp(token, "POST", "/me/player/previous");
        const err = await spError(r);
        if (err) result = { error: err };
        break;
      }

      case "volume": {
        const pct = Math.min(100, Math.max(0, Number(level) || 50));
        const r = await sp(token, "PUT", `/me/player/volume?volume_percent=${pct}`);
        const err = await spError(r);
        if (err) result = { error: err };
        break;
      }

      case "shuffle": {
        const r = await sp(token, "PUT", "/me/player/shuffle?state=true");
        const err = await spError(r);
        if (err) result = { error: err };
        break;
      }

      case "current": {
        const res = await sp(token, "GET", "/me/player/currently-playing");
        if (res.status === 204) { result = { playing: false }; break; }
        const err = await spError(res);
        if (err) { result = { error: err }; break; }
        const d = await res.json();
        result = { playing: d.is_playing, track: d.item?.name, artist: d.item?.artists?.[0]?.name };
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
