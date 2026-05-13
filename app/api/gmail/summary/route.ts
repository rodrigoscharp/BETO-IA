import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getGoogleToken, gmailHeader, GmailMessage } from "@/lib/google";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function extractSender(from: string): string {
  const named = from.match(/^"?([^"<]+)"?\s*</);
  if (named) return named[1].trim();
  return from.split("@")[0] || from;
}

function formatDate(rawDate: string): string {
  if (!rawDate) return "";
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return rawDate;
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86_400_000);

    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 0) return `hoje às ${time}`;
    if (diffDays === 1) return `ontem às ${time}`;
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }) + ` às ${time}`;
  } catch {
    return rawDate;
  }
}

/* ── GET /api/gmail/summary ──────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const token  = await getGoogleToken(req);
  if (!token) return NextResponse.json({ needsLogin: true }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  try {
    const listParams = new URLSearchParams({
      q:          "is:unread in:inbox",
      maxResults: "20",
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

    // Fetch metadata: From, Subject, Date — never body/snippet to avoid hallucination
    const details: GmailMessage[] = await Promise.all(
      messages.slice(0, 15).map(async ({ id }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return r.ok ? r.json() : { id, threadId: id };
      })
    );

    // Build structured email list with real data only
    const emailList = details.map((msg, i) => {
      const from    = gmailHeader(msg, "From");
      const subject = gmailHeader(msg, "Subject") || "(sem assunto)";
      const date    = formatDate(gmailHeader(msg, "Date"));
      const sender  = extractSender(from);
      const email   = from.match(/<(.+?)>/)?.[1] ?? from;
      return `${i + 1}. Remetente: ${sender} <${email}> | Assunto: ${subject} | Recebido: ${date}`;
    }).join("\n");

    const groq       = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model:    "llama-3.3-70b-versatile",
      messages: [
        {
          role:    "system",
          content: `Você é o assistente do Rodrigo. Analise os emails abaixo usando SOMENTE os dados fornecidos (remetente, assunto, data recebida). NUNCA invente, infira ou suponha conteúdo que não esteja explicitamente nos dados.

Classifique cada email em:
- IMPORTANTE: emails de pessoas reais (nome próprio no remetente), empresas de trabalho, bancos, saúde, governo, entregas/correios, notificações de pagamento reais
- PROMOCIONAL: newsletters, marketing, cupons, ofertas, "% off", "promoção", "exclusivo para você", plataformas de conteúdo (Udemy, Coursera, Medium etc.), redes sociais automáticas

Responda em português casual, como se estivesse contando para o Rodrigo. Siga este formato:
- Se houver emails importantes: mencione cada um pelo nome do remetente e assunto EXATOS (sem inventar), com a data recebida
- Agrupe os promocionais no final: "Além disso, X emails promocionais que você pode ignorar."
- Se não houver nada importante: diga isso claramente
- Máximo 5 frases. Nunca mencione conteúdo do email além do assunto.`,
        },
        {
          role:    "user",
          content: `${details.length} emails não lidos:\n\n${emailList}`,
        },
      ],
      temperature: 0.3,
      max_tokens:  400,
    });

    const summary = completion.choices[0]?.message?.content ?? "Não consegui analisar os emails.";
    return NextResponse.json({ summary, count: details.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
