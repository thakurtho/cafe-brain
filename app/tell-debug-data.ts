import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";

export type TellDebugRow = {
  id: string;
  sessionMode: string;
  contentType: string;
  subject: string | null;
  isCashRelated: boolean;
  confidence: number | null;
  savedTable: string | null;
  summaryText: string | null;
  createdAt: string;
};

const TABLE_BY_CONTENT_TYPE: Record<string, { table: string; textColumn: string; hasCashColumn: boolean } | undefined> = {
  log: { table: "logs", textColumn: "summary", hasCashColumn: true },
  incident: { table: "incidents", textColumn: "description", hasCashColumn: true },
  judgment_call: { table: "judgment_calls", textColumn: "situation", hasCashColumn: false },
  task_request: { table: "tasks", textColumn: "description", hasCashColumn: false },
};

/**
 * TEST-HARNESS ONLY — not part of the real app (per your request while the
 * real destinations for these records — Team screen, Approve/Review —
 * don't exist yet). Shows the last N Tell AND Ask classifications straight
 * from session_classifications, with the resulting record's text + subject
 * looked up so you can see exactly what got saved without a Supabase tab
 * open. Delete app/tell-debug-panel.tsx + this file once those real
 * screens exist.
 */
export async function getRecentTellDebugData(limit = 15): Promise<TellDebugRow[]> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  // session_classifications has no outlet_id of its own — join through
  // sessions to scope it, same as everywhere else in this app.
  const { data: sessions, error: sessionsErr } = await supabase
    .from("sessions")
    .select("id, mode")
    .eq("outlet_id", outletId);
  if (sessionsErr) throw new Error(`Could not load sessions: ${sessionsErr.message}`);
  const modeBySessionId = new Map((sessions ?? []).map((s) => [s.id, s.mode]));
  const ids = [...modeBySessionId.keys()];
  if (ids.length === 0) return [];

  const { data: classifications, error: classErr } = await supabase
    .from("session_classifications")
    .select("id, session_id, classified_as, resulting_id, confidence, created_at")
    .in("session_id", ids)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (classErr) throw new Error(`Could not load classifications: ${classErr.message}`);

  return Promise.all(
    (classifications ?? []).map(async (c): Promise<TellDebugRow> => {
      const mapping = TABLE_BY_CONTENT_TYPE[c.classified_as];
      let summaryText: string | null = null;
      let subject: string | null = null;
      let isCashRelated = false;
      if (mapping && c.resulting_id) {
        const columns = mapping.hasCashColumn
          ? `${mapping.textColumn}, subject, is_cash_related`
          : `${mapping.textColumn}, subject`;
        const { data } = await (supabase as any)
          .from(mapping.table)
          .select(columns)
          .eq("id", c.resulting_id)
          .maybeSingle();
        summaryText = data?.[mapping.textColumn] ?? null;
        subject = data?.subject ?? null;
        isCashRelated = data?.is_cash_related ?? false;
      }
      return {
        id: c.id,
        sessionMode: modeBySessionId.get(c.session_id) ?? "unknown",
        contentType: c.classified_as,
        subject,
        isCashRelated,
        confidence: c.confidence,
        savedTable: mapping?.table ?? null,
        summaryText,
        createdAt: c.created_at,
      };
    })
  );
}

export type KnowledgeGapDebugRow = {
  id: string;
  questionText: string;
  occurrenceCount: number;
  status: string;
  createdAt: string;
};

// knowledge_gaps rows are written directly on a failed Ask lookup (v4
// §7), not through session_classifications — so they need their own
// query to show up in the debug panel at all.
export async function getRecentKnowledgeGaps(limit = 10): Promise<KnowledgeGapDebugRow[]> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const { data, error } = await supabase
    .from("knowledge_gaps")
    .select("id, question_text, occurrence_count, status, created_at")
    .eq("outlet_id", outletId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load knowledge gaps: ${error.message}`);

  return (data ?? []).map((g) => ({
    id: g.id,
    questionText: g.question_text,
    occurrenceCount: g.occurrence_count,
    status: g.status,
    createdAt: g.created_at,
  }));
}
