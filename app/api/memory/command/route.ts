import { NextRequest, NextResponse } from "next/server";
import { saveMemory, listMemories, deleteMemory } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, content, category, id } = body;

    if (action === "save") {
      if (!content) return NextResponse.json({ error: "content é obrigatório" }, { status: 400 });
      const result = await saveMemory(content, category ?? "general");
      return NextResponse.json(result);
    }

    if (action === "list") {
      const memories = await listMemories(30);
      return NextResponse.json({ memories });
    }

    if (action === "delete") {
      if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
      const result = await deleteMemory(id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
