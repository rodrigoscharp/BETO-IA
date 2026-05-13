import { NextRequest, NextResponse } from "next/server";
import { getGoogleToken, gmailHeader, GmailMessage } from "@/lib/google";

/* ── Extracts a human-readable sender name from a "Name <email>" header ── */

function extractSender(from: string): string {
  const named = from.match(/^"?([^"<]+)"?\s*</);
  if (named) return named[1].trim();
  return from.split("@")[0] || from;
}

/* ── GET /api/gmail/summary ──────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const token = await getGoogleToken(req);
  if (!token) return NextResponse.json({ needsLogin: true }, { status: 401 });

  try {
    const listParams = new URLSearchParams({
      q:          "is:unread in:inbox category:primary",
      maxResults: "10",
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
      messages.slice(0, 8).map(async ({ id }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return r.ok ? r.json() : { id, threadId: id };
      })
    );

    // Build summary from real data only — no LLM to avoid hallucination
    const items = details.slice(0, 6).map(msg => {
      const sender  = extractSender(gmailHeader(msg, "From"));
      const subject = gmailHeader(msg, "Subject") || "Sem assunto";
      return `de ${sender}: ${subject}`;
    });

    const count   = details.length;
    const listed  = items.join(". ");
    const extra   = count > items.length ? ` E mais ${count - items.length} outros.` : "";
    const summary = `Você tem ${count} email${count > 1 ? "s" : ""} não lido${count > 1 ? "s" : ""} na caixa principal. ${listed}.${extra}`;

    return NextResponse.json({ summary, count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
