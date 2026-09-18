import "server-only";
import { SUBJECT_TAGS, ENTITY_TYPE_BY_SUBJECT, type TellClassificationItem } from "@/lib/tell-classifier";
import type { SubjectTag } from "@/lib/supabase/database.types";

export type EntityCandidates = Partial<Record<SubjectTag, { id: string; name: string }[]>>;

// table -> subject, the reverse of SUBJECT_TAGS' entityTable — built once
// at module load rather than on every call.
const SUBJECT_BY_TABLE: Partial<Record<string, SubjectTag>> = Object.fromEntries(
  SUBJECT_TAGS.filter((s) => s.entityTable).map((s) => [s.entityTable as string, s.value])
);

/**
 * Turns this turn's vector-search results (lib/knowledge-search.ts) into
 * the same shape resolveEntity expects — replaces what used to be a full
 * per-subject table dump (fetchEntityCandidates, removed when Ask and
 * Tell merged into lib/talk-classifier.ts's unified flow). Only the
 * handful of entity-type chunks that came back as relevant to what was
 * just said become match candidates, not every customer/vendor/machine/
 * etc. in the outlet — the whole point of moving to search instead of a
 * dump. Trade-off, stated plainly: if search misses the right entity, it
 * won't be offered as a candidate this turn, unlike the old exhaustive
 * list. Recall can be tuned via the match_count passed to
 * searchKnowledgeChunks.
 */
export function buildEntityCandidatesFromChunks(
  chunks: { sourceTable: string; sourceId: string; title: string }[]
): EntityCandidates {
  const bySubject: EntityCandidates = {};
  for (const c of chunks) {
    const subject = SUBJECT_BY_TABLE[c.sourceTable];
    if (!subject) continue;
    (bySubject[subject] ??= []).push({ id: c.sourceId, name: c.title });
  }
  return bySubject;
}

export function buildEntityContextText(bySubject: EntityCandidates): string {
  return SUBJECT_TAGS.filter((s) => s.kind === "entity")
    .map((s) => `Known ${s.label} names right now: ${(bySubject[s.value] ?? []).map((r) => r.name).join(", ") || "(none)"}`)
    .join("\n");
}

export function resolveEntity(
  item: TellClassificationItem,
  bySubject: EntityCandidates
): { entityType: string | null; entityId: string | null } {
  const subject = item.subject ?? null;
  if (!subject || !item.entity_name) return { entityType: null, entityId: null };
  const candidates = bySubject[subject];
  const match = candidates?.find((c) => c.name === item.entity_name);
  if (!match) return { entityType: null, entityId: null };
  return { entityType: ENTITY_TYPE_BY_SUBJECT[subject] ?? null, entityId: match.id };
}
