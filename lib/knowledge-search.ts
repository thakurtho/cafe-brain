import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { embedQuery } from "@/lib/embeddings";

export type KnowledgeChunk = {
  id: string;
  sourceTable: string;
  sourceId: string;
  title: string;
  content: string;
  similarity: number;
};

/**
 * The one retrieval mechanism behind the merged Ask/Tell flow (see
 * lib/embeddings.ts and the 20260918120000 migration's match_knowledge_chunks
 * function) — turns whatever the employee just said into an embedding and
 * finds the closest-matching handful of knowledge_chunks rows, whether
 * that turns out to be a recipe, an SOP, or a specific customer's record.
 * Replaces reading every table in full on every turn.
 */
export async function searchKnowledgeChunks(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: string,
  queryText: string,
  matchCount = 8
): Promise<KnowledgeChunk[]> {
  const queryEmbedding = await embedQuery(queryText);

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_outlet_id: outletId,
    match_count: matchCount,
  });
  if (error) throw new Error(`Knowledge search failed: ${error.message}`);

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    sourceTable: r.source_table,
    sourceId: r.source_id,
    title: r.title,
    content: r.content,
    similarity: r.similarity,
  }));
}

export function buildKnowledgeContextText(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return "(no matching records found in the knowledge base)";
  return chunks.map((c) => `### ${c.title} (${c.sourceTable})\n${c.content}`).join("\n\n");
}
