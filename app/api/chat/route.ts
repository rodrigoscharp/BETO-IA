import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const JARVIS_SYSTEM_PROMPT = `Você é J.A.R.V.I.S, o assistente pessoal inteligente do usuário. Responda sempre em português brasileiro, de forma inteligente, direta e levemente formal, como o Jarvis do Homem de Ferro. Seja prestativo, eficiente e ocasionalmente demonstre personalidade. Mantenha respostas concisas e objetivas, a não ser que o usuário peça detalhes. Você pode usar humor sutil e ironia britânica de vez em quando.

SPOTIFY: Você também controla o Spotify do usuário. Quando ele pedir algo relacionado a música no Spotify, inclua NO INÍCIO da sua resposta uma tag de ação neste formato exato (sem espaço antes):
[SPOTIFY:{"action":"..."}]
Ações disponíveis:
- play com música: [SPOTIFY:{"action":"play","query":"nome da música ou artista"}] — use o nome EXATAMENTE como o usuário falou, sem traduzir ou modificar
- play com playlist: [SPOTIFY:{"action":"play","query":"playlist nome da playlist"}]
- play com artista: [SPOTIFY:{"action":"play","query":"artista nome do artista"}]
- pausar: [SPOTIFY:{"action":"pause"}]
- continuar: [SPOTIFY:{"action":"resume"}]
- próxima: [SPOTIFY:{"action":"next"}]
- anterior: [SPOTIFY:{"action":"previous"}]
- volume: [SPOTIFY:{"action":"volume","level":70}]
- o que está tocando: [SPOTIFY:{"action":"current"}]
- modo aleatório: [SPOTIFY:{"action":"shuffle"}]
Exemplos:
"toca Bohemian Rhapsody" → [SPOTIFY:{"action":"play","query":"Bohemian Rhapsody"}] Claro, tocando Bohemian Rhapsody.
"pausa a música" → [SPOTIFY:{"action":"pause"}] Música pausada.
"próxima" → [SPOTIFY:{"action":"next"}] Pulando para a próxima.
"volume 60" → [SPOTIFY:{"action":"volume","level":60}] Volume ajustado para 60%.
"o que está tocando?" → [SPOTIFY:{"action":"current"}] Verificando agora.
Após a tag, escreva sua resposta normal. A tag não será lida em voz alta.`;

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
      model: "llama-3.3-70b-versatile",
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
