import { createClient } from "@supabase/supabase-js";

const url  = process.env.SUPABASE_URL!;
const key  = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export interface Memory {
  id?: string;
  content: string;
  category: string;
  created_at?: string;
}

export async function saveMemory(content: string, category = "general"): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("jarvis_memories")
    .insert({ content, category });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listMemories(limit = 30): Promise<Memory[]> {
  const { data, error } = await supabase
    .from("jarvis_memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as Memory[];
}

export async function deleteMemory(id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from("jarvis_memories")
    .delete()
    .eq("id", id);

  return { ok: !error };
}
