import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const JARVIS_SYSTEM_PROMPT = `Você é J.A.R.V.I.S, o assistente pessoal inteligente do usuário. Responda sempre em português brasileiro, de forma inteligente, direta e levemente formal, como o Jarvis do Homem de Ferro. Seja prestativo, eficiente e ocasionalmente demonstre personalidade. Mantenha respostas concisas e objetivas, a não ser que o usuário peça detalhes. Você pode usar humor sutil e ironia britânica de vez em quando.`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Payload inválido: messages é obrigatório." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY não configurada no servidor." },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: "llama3-70b-8192",
      messages: [
        { role: "system", content: JARVIS_SYSTEM_PROMPT },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content ?? "";

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    console.error("[Jarvis API] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro desconhecido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
