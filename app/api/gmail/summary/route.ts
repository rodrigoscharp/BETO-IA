import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getGoogleToken, gmailHeader, GmailMessage } from "@/lib/google";

/* ── GET /api/gmail/summary ──────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const token  = await getGoogleToken(req);
  if (!token) return NextResponse.json({ needsLogin: true }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  try {
    const listParams = new URLSearchParams({
      q:          "is:unread in:inbox category:primary",
      maxResults: "15",
    });

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!listRes.ok) {
      if (listRes.status === 401) return NextResponse.json({ needsLogin: true }, { status: 401 });
      if (listRes.status === 403) return NextResponse.json({
        summary: "Não consigo acessar seu Gmail. Habilite a Gmail API no Google Cloud Console e reautorize.",
      });
      const err = await listRes.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message ?? "Erro ao listar emails" }, { status: 500 });
    }

    const listData = await listRes.json();
    const messages: { id: string }[] = listData.messages ?? [];
    if (messages.length === 0) {
      return NextResponse.json({ summary: "Nenhum email não lido na caixa de entrada.", count: 0 });
    }

    const details: GmailMessage[] = await Promise.all(
      messages.slice(0, 12).map(async ({ id }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return r.ok ? r.json() : { id, threadId: id };
      })
    );

    const emailList = details.map((msg, i) => {
      const from    = gmailHeader(msg, "From");
      const subject = gmailHeader(msg, "Subject");
      const snippet = msg.snippet ?? "";
      return `${i + 1}. De: ${from}\n   Assunto: ${subject}\n   Prévia: ${snippet.slice(0, 200)}`;
    }).join("\n\n");

    const groq       = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model:    "llama-3.3-70b-versatile",
      messages: [
        {
          role:    "system",
          content: `Você é um assistente pessoal do Rodrigo. Analise os emails abaixo e faça um resumo falado, natural e conciso — como se estivesse contando pra ele de forma amigável.

Regras:
- Ignore emails de marketing, promoções, newsletters, notificações automáticas de apps
- Foque em: emails de pessoas reais, clientes, trabalho importante, bancos, saúde, urgências
- Agrupe por tema se fizer sentido
- Seja direto: "Você tem 2 emails importantes: um do João sobre o projeto X, e um do banco sobre..."
- Se não houver nada relevante, diga isso
- Responda em português brasileiro, tom casual, máximo 4 frases curtas — complete sempre as frases, nunca corte no meio`,
        },
        {
          role:    "user",
          content: `Emails não lidos (${details.length}):\n\n${emailList}`,
        },
      ],
      temperature: 0.6,
      max_tokens:  500,
    });

    const summary = completion.choices[0]?.message?.content ?? "Não consegui resumir os emails.";
    return NextResponse.json({ summary, count: details.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
