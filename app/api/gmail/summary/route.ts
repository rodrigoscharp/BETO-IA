import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

/* ── Token helper (mesmo padrão do Calendar) ─────────────────────────── */
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

interface GmailHeader { name: string; value: string }
interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
}

function header(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/* ── GET /api/gmail/summary ──────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const token = await getValidToken(req);
  if (!token) return NextResponse.json({ needsLogin: true }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  try {
    /* 1. Lista IDs de emails não lidos da caixa principal (sem promoções/social) */
    const listParams = new URLSearchParams({
      q:          "is:unread in:inbox category:primary",
      maxResults: "15",
    });

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      if (listRes.status === 401) {
        return NextResponse.json({ needsLogin: true }, { status: 401 });
      }
      if (listRes.status === 403) {
        return NextResponse.json({
          summary: "Não consigo acessar seu Gmail. Vá em console.cloud.google.com, abra APIs e Services, Library, busque Gmail API e clique em Enable. Depois acesse jarvis-beta-one.vercel.app barra api barra calendar barra login para reautorizar.",
        });
      }
      return NextResponse.json({ error: err?.error?.message ?? "Erro ao listar emails" }, { status: 500 });
    }

    const listData = await listRes.json();
    const messages: { id: string }[] = listData.messages ?? [];

    if (messages.length === 0) {
      return NextResponse.json({ summary: "Nenhum email não lido na caixa de entrada.", count: 0 });
    }

    /* 2. Busca metadados de cada email em paralelo (subject, from, snippet) */
    const details: GmailMessage[] = await Promise.all(
      messages.slice(0, 12).map(async ({ id }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return r.ok ? r.json() : { id, threadId: id };
      })
    );

    /* 3. Monta lista legível para o Groq */
    const emailList = details.map((msg, i) => {
      const from    = header(msg, "From");
      const subject = header(msg, "Subject");
      const snippet = msg.snippet ?? "";
      return `${i + 1}. De: ${from}\n   Assunto: ${subject}\n   Prévia: ${snippet.slice(0, 200)}`;
    }).join("\n\n");

    /* 4. Groq filtra e resume o que é relevante */
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Você é um assistente pessoal do Rodrigo. Analise os emails abaixo e faça um resumo falado, natural e conciso — como se estivesse contando pra ele de forma amigável.

Regras:
- Ignore emails de marketing, promoções, newsletters, notificações automáticas de apps (GitHub notifications genéricas, etc.)
- Foque em: emails de pessoas reais, clientes, trabalho importante, bancos/financeiro, saúde, urgências
- Agrupe por tema se fizer sentido
- Seja direto: "Você tem 2 emails importantes: um do João sobre o projeto X, e um do banco sobre..."
- Se não houver nada relevante, diga isso
- Responda em português brasileiro, tom casual, máximo 3 frases`,
        },
        {
          role: "user",
          content: `Emails não lidos (${details.length}):\n\n${emailList}`,
        },
      ],
      temperature: 0.6,
      max_tokens: 300,
    });

    const summary = completion.choices[0]?.message?.content ?? "Não consegui resumir os emails.";
    return NextResponse.json({ summary, count: details.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
