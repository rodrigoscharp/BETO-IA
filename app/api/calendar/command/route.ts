import { NextRequest, NextResponse } from "next/server";
import { getGoogleToken, googleFetch } from "@/lib/google";

/* ── Date/time parser ────────────────────────────────────────────────────── */

function parseDateTime(dateStr: string, timeStr?: string): { start: string; end: string } {
  const now = new Date();

  let date = new Date(dateStr + "T12:00:00");
  if (isNaN(date.getTime())) {
    date = new Date(now);
    const lower = dateStr.toLowerCase();
    const daysAhead: Record<string, number> = {
      segunda: 1, "terça": 2, terca: 2, quarta: 3, quinta: 4,
      sexta: 5, "sábado": 6, sabado: 6, domingo: 0,
    };
    if (lower.includes("amanhã") || lower.includes("amanha")) {
      date.setDate(date.getDate() + 1);
    } else {
      for (const [word, targetDay] of Object.entries(daysAhead)) {
        if (lower.includes(word)) {
          date.setDate(date.getDate() + ((targetDay - date.getDay() + 7) % 7 || 7));
          break;
        }
      }
    }
  }

  let hours = 9, minutes = 0;
  if (timeStr) {
    const t = timeStr.toLowerCase().trim();
    if (t.includes("meio-dia") || t.includes("meio dia")) {
      hours = 12; minutes = 0;
    } else if (t.includes("meia-noite") || t.includes("meia noite")) {
      hours = 0; minutes = 0;
    } else {
      const normalized = t.replace(/h(\d{2})/g, ":$1").replace(/h$/g, ":00");
      const match = normalized.match(/(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        hours   = parseInt(match[1]);
        minutes = match[2] ? parseInt(match[2]) : 0;
        if (/pm|tarde|noite/.test(t) && hours < 12) hours += 12;
        if (/am|manhã|manha/.test(t) && hours === 12) hours = 0;
        if (hours >= 1 && hours <= 6 && !/am|manhã|manha/.test(t)) hours += 12;
      }
    }
  }

  const pad  = (n: number) => String(n).padStart(2, "0");
  const y    = date.getFullYear();
  const mo   = pad(date.getMonth() + 1);
  const d    = pad(date.getDate());
  const endH = hours + 1 >= 24 ? 23 : hours + 1;
  const endM = hours + 1 >= 24 ? 59 : minutes;

  return {
    start: `${y}-${mo}-${d}T${pad(hours)}:${pad(minutes)}:00-03:00`,
    end:   `${y}-${mo}-${d}T${pad(endH)}:${pad(endM)}:00-03:00`,
  };
}

/* ── POST /api/calendar/command ──────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const token = await getGoogleToken(req);
  if (!token) return NextResponse.json({ needsLogin: true }, { status: 401 });

  const { action, title, date, time, duration, query } = await req.json();
  const base = "https://www.googleapis.com/calendar/v3";

  try {
    switch (action) {
      case "create": {
        if (!title || !date) {
          return NextResponse.json({ error: "Título e data são necessários." }, { status: 400 });
        }

        const { start, end } = parseDateTime(date, time);
        let endDate = new Date(end);
        if (duration) {
          endDate = new Date(start);
          endDate.setMinutes(endDate.getMinutes() + Number(duration));
        }

        const event = {
          summary: title,
          start:   { dateTime: new Date(start).toISOString(), timeZone: "America/Sao_Paulo" },
          end:     { dateTime: endDate.toISOString(),          timeZone: "America/Sao_Paulo" },
        };

        const res = await googleFetch(token, `${base}/calendars/primary/events`, {
          method: "POST",
          body:   JSON.stringify(event),
        });
        if (!res.ok) {
          const err = await res.json();
          return NextResponse.json({ error: err?.error?.message ?? "Erro ao criar evento." });
        }

        const created  = await res.json();
        const rawStart = (created.start.dateTime ?? created.start.date ?? "")
          .replace(/([+-]\d{2}:\d{2}|Z)$/, "");
        return NextResponse.json({ ok: true, title: created.summary, start: rawStart, link: created.htmlLink });
      }

      case "list": {
        const params = new URLSearchParams({
          timeMin:      new Date().toISOString(),
          maxResults:   "5",
          singleEvents: "true",
          orderBy:      "startTime",
        });
        if (query) params.set("q", query);

        const res = await googleFetch(token, `${base}/calendars/primary/events?${params}`);
        if (!res.ok) return NextResponse.json({ error: "Erro ao buscar eventos." });

        const data   = await res.json();
        const events = (data.items ?? []).map((e: {
          summary?: string;
          start?:   { dateTime?: string; date?: string };
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
