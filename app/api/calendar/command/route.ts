import { NextRequest, NextResponse } from "next/server";

async function getValidToken(req: NextRequest): Promise<string | null> {
  const at = req.cookies.get("gc_at")?.value;
  if (at) return at;

  const rt = req.cookies.get("gc_rt")?.value;
  if (!rt) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: rt,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const d = await res.json();
  return d.access_token ?? null;
}

function gcFetch(token: string, path: string, method = "GET", body?: object) {
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* Parse natural date/time strings from Groq into ISO format */
function parseDateTime(dateStr: string, timeStr?: string): { start: string; end: string } {
  const now = new Date();

  // dateStr: "2026-04-27", "amanhã", "hoje", "segunda", etc.
  let date = new Date(dateStr + "T12:00:00"); // noon to avoid timezone shift
  if (isNaN(date.getTime())) {
    date = new Date(now);
    const lower = dateStr.toLowerCase();
    if (lower.includes("amanhã") || lower.includes("amanha")) {
      date.setDate(date.getDate() + 1);
    } else if (lower.includes("segunda")) {
      date.setDate(date.getDate() + ((1 - date.getDay() + 7) % 7 || 7));
    } else if (lower.includes("terça") || lower.includes("terca")) {
      date.setDate(date.getDate() + ((2 - date.getDay() + 7) % 7 || 7));
    } else if (lower.includes("quarta")) {
      date.setDate(date.getDate() + ((3 - date.getDay() + 7) % 7 || 7));
    } else if (lower.includes("quinta")) {
      date.setDate(date.getDate() + ((4 - date.getDay() + 7) % 7 || 7));
    } else if (lower.includes("sexta")) {
      date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7 || 7));
    } else if (lower.includes("sábado") || lower.includes("sabado")) {
      date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7));
    } else if (lower.includes("domingo")) {
      date.setDate(date.getDate() + ((0 - date.getDay() + 7) % 7 || 7));
    }
  }

  // timeStr: "15:00", "3pm", "14h30", "meio-dia", "meia-noite", "3 da tarde"
  let hours = 9, minutes = 0;
  if (timeStr) {
    const t = timeStr.toLowerCase().trim();

    if (t.includes("meio-dia") || t.includes("meio dia")) {
      hours = 12; minutes = 0;
    } else if (t.includes("meia-noite") || t.includes("meia noite")) {
      hours = 0; minutes = 0;
    } else {
      // Normalize: "14h30" → "14:30", "3h" → "3:00"
      const normalized = t.replace(/h(\d{2})/g, ":$1").replace(/h$/g, ":00");
      const match = normalized.match(/(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        hours   = parseInt(match[1]);
        minutes = match[2] ? parseInt(match[2]) : 0;

        // am/pm suffix
        if (/pm|tarde|noite/.test(t) && hours < 12) hours += 12;
        if (/am|manhã|manha/.test(t) && hours === 12) hours = 0;

        // Ambiguous: 1-6 without qualifier → assume afternoon
        if (hours >= 1 && hours <= 6 && !/am|manhã|manha/.test(t)) hours += 12;
      }
    }
  }

  // Send with explicit Brasília offset (-03:00) so Google has zero ambiguity
  const pad = (n: number) => String(n).padStart(2, "0");
  const y  = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d2 = pad(date.getDate());
  const endH = hours + 1 >= 24 ? 23 : hours + 1;
  const endM = hours + 1 >= 24 ? 59 : minutes;

  return {
    start: `${y}-${mo}-${d2}T${pad(hours)}:${pad(minutes)}:00-03:00`,
    end:   `${y}-${mo}-${d2}T${pad(endH)}:${pad(endM)}:00-03:00`,
  };
}

export async function POST(req: NextRequest) {
  const token = await getValidToken(req);
  if (!token) return NextResponse.json({ needsLogin: true }, { status: 401 });

  const body = await req.json();
  const { action, title, date, time, duration, query } = body;

  try {
    switch (action) {
      case "create": {
        if (!title || !date) {
          return NextResponse.json({ error: "Título e data são necessários." }, { status: 400 });
        }

        const { start, end } = parseDateTime(date, time);

        // If duration specified in minutes, override end
        let endDate = new Date(end);
        if (duration) {
          endDate = new Date(start);
          endDate.setMinutes(endDate.getMinutes() + Number(duration));
        }

        const event = {
          summary:  title,
          start:    { dateTime: new Date(start).toISOString(), timeZone: "America/Sao_Paulo" },
          end:      { dateTime: endDate.toISOString(),          timeZone: "America/Sao_Paulo" },
        };

        const res = await gcFetch(token, "/calendars/primary/events", "POST", event);
        if (!res.ok) {
          const err = await res.json();
          return NextResponse.json({ error: err?.error?.message ?? "Erro ao criar evento." });
        }

        const created = await res.json();
        // dateTime comes back with offset e.g. "2026-04-27T15:00:00-03:00"
        // strip the offset so JS doesn't convert to UTC
        const rawStart = (created.start.dateTime ?? created.start.date ?? "").replace(/([+-]\d{2}:\d{2}|Z)$/, "");
        return NextResponse.json({
          ok:    true,
          title: created.summary,
          start: rawStart,
          link:  created.htmlLink,
        });
      }

      case "list": {
        // Fetch next 5 events
        const timeMin = new Date().toISOString();
        const params  = new URLSearchParams({
          calendarId:   "primary",
          timeMin,
          maxResults:   "5",
          singleEvents: "true",
          orderBy:      "startTime",
        });
        if (query) params.set("q", query);

        const res = await gcFetch(token, `/calendars/primary/events?${params}`);
        if (!res.ok) return NextResponse.json({ error: "Erro ao buscar eventos." });

        const d = await res.json();
        const events = (d.items ?? []).map((e: {
          summary?: string;
          start?: { dateTime?: string; date?: string };
        }) => ({
          title: e.summary ?? "Sem título",
          start: e.start?.dateTime ?? e.start?.date,
        }));

        return NextResponse.json({ ok: true, events });
      }

      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (err) {
    console.error("[Calendar command]", err);
    return NextResponse.json({ error: "Erro ao conectar com o Google Calendar." }, { status: 500 });
  }
}
