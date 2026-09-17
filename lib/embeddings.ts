import "server-only";

/**
 * Voyage AI embeddings — Anthropic's own recommended pairing for RAG
 * alongside Claude (Claude itself doesn't generate embeddings). Plain
 * fetch rather than an SDK: it's a single REST call, doesn't justify a
 * new dependency.
 *
 * voyage-3-lite produces 512-dimension vectors — matches the
 * `vector(512)` column in the 20260918120000 migration. Changing
 * VOYAGE_MODEL to a different-dimension model means updating that column
 * (and re-embedding everything), not just this env var.
 */

const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3-lite";
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

function requireApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error("Missing VOYAGE_API_KEY. Add it to .env.local — get one at dash.voyageai.com → API Keys.");
  }
  return key;
}

// input_type "document" for content being indexed, "query" for a
// search question — Voyage embeds these two asymmetrically to improve
// match quality, so using the right one on each side matters.
async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = requireApiKey();

  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voyage embeddings request failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as { data: { embedding: number[]; index: number }[] };
  // Voyage's response order matches input order, but sort by index
  // defensively rather than assume that's guaranteed.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "document");
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "query");
  return vector;
}
