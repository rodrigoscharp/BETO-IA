import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "query required" }, { status: 400 });

  const query = `${q} official audio`;
  const url   = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });

  const html = await res.text();

  // YouTube embeds video IDs in its initial page data as "videoId":"XXXXXXXXXXX"
  const ids: string[] = [];
  const re = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.push(m[1]);

  // filter out YouTube Shorts and channel IDs (usually duplicated quickly)
  const videoId = ids.find((id, i) => ids.indexOf(id) === i) ?? ids[0];

  if (!videoId) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ videoId, query: q });
}
