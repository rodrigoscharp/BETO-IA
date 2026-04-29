import { NextRequest, NextResponse } from "next/server";

const WA_SERVICE = process.env.WHATSAPP_SERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  try {
    const { action, to, message } = await req.json();

    if (action === "status") {
      const res  = await fetch(`${WA_SERVICE}/status`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "send") {
      if (!to || !message) {
        return NextResponse.json({ error: "Parâmetros 'to' e 'message' são obrigatórios." }, { status: 400 });
      }

      const res  = await fetch(`${WA_SERVICE}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message }),
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    // Se o serviço WhatsApp não está rodando
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
      return NextResponse.json({
        error: "Serviço WhatsApp offline. Rode 'npm start' dentro de whatsapp-service/.",
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
