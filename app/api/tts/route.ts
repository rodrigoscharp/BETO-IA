import { NextRequest, NextResponse } from "next/server";

// Voz masculina natural em pt-BR — "George" da ElevenLabs (multilingual v2)
// Outras opções de voice_id masculinas:
//   Adam     → pNInz6obpgDQGcFmaJgB  (grave, imponente)
//   George   → JBFqnCBsd6RMkjVDRZzb  (natural, versátil) ← padrão
//   Josh     → TxGEqnHWrfWFTfGW9XjX  (jovem, energético)
//   Arnold   → VR6AewLTigWG4xSOukaG  (forte, marcante)
const VOICE_ID = "ZqE9vIHPcrC35dZv0Svu"; // Adam Borges (pt-BR)

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text é obrigatório." }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY não configurada." }, { status: 500 });
    }

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.82,
            style: 0.25,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
