import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

/* ── Token helper ────────────────────────────────────────────────────── */
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

/* ── Calendar: eventos de hoje ───────────────────────────────────────── */
async function getTodayEvents(token: string): Promise<string> {
  try {
    const now   = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end   = new Date(now); end.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      timeMin:      start.toISOString(),
      timeMax:      end.toISOString(),
      maxResults:   "10",
      singleEvents: "true",
      orderBy:      "startTime",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return "Não consegui acessar o calendário.";
    const d = await res.json();
    const events = d.items ?? [];

    if (events.length === 0) return "Nenhum evento agendado para hoje.";

    return events.map((e: { summary?: string; start?: { dateTime?: string; date?: string } }) => {
      const title = e.summary ?? "Sem título";
      const dt    = e.start?.dateTime;
      if (!dt) return title;
      const time  = new Date(dt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return `${title} às ${time}`;
    }).join(", ");
  } catch {
    return "Erro ao buscar calendário.";
  }
}

/* ── Gmail: emails importantes não lidos ─────────────────────────────── */
interface GmailHeader { name: string; value: string }
interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
}

function hdr(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function getImportantEmails(token: string, groqKey: string): Promise<string> {
  try {
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox+category:primary&maxResults=12",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!listRes.ok) return "Sem acesso ao Gmail. Faça login novamente.";
    const listData = await listRes.json();
    const messages: { id: string }[] = listData.messages ?? [];
    if (messages.length === 0) return "Nenhum email não lido.";

    const details: GmailMessage[] = await Promise.all(
      messages.map(async ({ id }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return r.ok ? r.json() : { id, threadId: id };
      })
    );

    const emailList = details.map((msg, i) =>
      `${i + 1}. De: ${hdr(msg, "From")} | Assunto: ${hdr(msg, "Subject")} | ${(msg.snippet ?? "").slice(0, 150)}`
    ).join("\n");

    const groq = new Groq({ apiKey: groqKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "Filtre apenas emails de pessoas reais, clientes, trabalho, bancos ou urgências. Ignore marketing, newsletters, notificações automáticas de apps. Retorne um resumo de 1-2 frases em português casual. Se não houver nada relevante, diga 'nenhum email importante'. Seja muito conciso.",
        },
        { role: "user", content: emailList },
      ],
      temperature: 0.5,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content ?? "Nenhum email importante.";
  } catch {
    return "Erro ao buscar emails.";
  }
}

/* ── Clima (OpenWeatherMap — opcional) ───────────────────────────────── */
async function getWeather(): Promise<string> {
  const key  = process.env.OPENWEATHER_API_KEY;
  const city = process.env.OPENWEATHER_CITY ?? "São Paulo";
  if (!key) return "";

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric&lang=pt_br`
    );
    if (!res.ok) return "";
    const d = await res.json();
    const temp = Math.round(d.main?.temp ?? 0);
    const desc = d.weather?.[0]?.description ?? "";
    return `${temp}°C e ${desc} em ${city}`;
  } catch {
    return "";
  }
}

/* ── GET /api/briefing ───────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const token  = await getValidToken(req);
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  /* Busca tudo em paralelo */
  const [events, emails, weather] = await Promise.all([
    token ? getTodayEvents(token) : Promise.resolve("Calendário não conectado."),
    token && apiKey ? getImportantEmails(token, apiKey) : Promise.resolve("Gmail não conectado."),
    getWeather(),
  ]);

  /* Monta o contexto para o Groq gerar o briefing falado */
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

  const context = [
    `Data: ${today}`,
    `Agenda de hoje: ${events}`,
    `Emails não lidos: ${emails}`,
    weather ? `Clima: ${weather}` : null,
  ].filter(Boolean).join("\n");

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Você é o J.A.R.V.I.S do Rodrigo. Gere um briefing matinal falado, natural e motivador — como um copiloto que quer deixar o dia do Rodrigo organizado. Use as informações abaixo. Tom: casual, direto, animado mas sem exagero. Máximo 5 frases. Comece com "Bom dia, Rodrigo!" ou algo similar. Fale o dia e data, a agenda, os emails importantes, e o clima se disponível. Termine com uma frase curta de incentivo ou observação pertinente.`,
        },
        { role: "user", content: context },
      ],
      temperature: 0.8,
      max_tokens: 400,
    });

    const briefing = completion.choices[0]?.message?.content ?? "Não consegui montar o briefing.";
    return NextResponse.json({ briefing });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
