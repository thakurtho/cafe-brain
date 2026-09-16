import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";

export type TellDebugRow = {
  id: string;
  contentType: string;
  subject: string | null;
  confidence: number | null;
  savedTable: string | null;
  summaryText: string | null;
  createdAt: string;
};

const TABLE_BY_CONTENT_TYPE: Record<string, { table: string; textColumn: string } | undefined> = {
  log: { table: "logs", textColumn: "summary" },
  incident: { table: "incidents", textColumn: "description" },
  judgment_call: { table: "judgment_calls", textColumn: "situation" },
  task_request: { table: "tasks", textColumn: "description" },
};

/**
 * TEST-HARNESS ONLY — not part of the real app (per your request while the
 * real destinations for these records — Team screen, Approve/Review —
 * don't exist yet). Shows the last N Tell classifications straight from
 * session_classifications, with the resulting record's text + subject
 * looked up so you can see exactly what got saved without a Supabase tab
 * open. Delete app/tell-debug-panel.tsx + this file once those real
 * screens exist.
 */
export async function getRecentTellDebugData(limit = 15): Promise<TellDebugRow[]> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  // session_classifications has no outlet_id of its own — join through
  // sessions to scope it, same as everywhere else in this app.
  const { data: sessionIds, error: sessionsErr } = await supabase
    .from("sessions")
    .select("id")
    .eq("outlet_id", outletId)
    .eq("mode", "tell");
  if (sessionsErr) throw new Error(`Could not load sessions: ${sessionsErr.message}`);
  const ids = (sessionIds ?? []).map((s) => s.id);
  if (ids.length === 0) return [];

  const { data: classifications, error: classErr } = await supabase
    .from("session_classifications")
    .select("id, classified_as, resulting_id, confidence, created_at")
    .in("session_id", ids)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (classErr) throw new Error(`Could not load classifications: ${classErr.message}`);

  return Promise.all(
    (classifications ?? []).map(async (c): Promise<TellDebugRow> => {
      const mapping = TABLE_BY_CONTENT_TYPE[c.classified_as];
      let summaryText: string | null = null;
      let subject: string | null = null;
      if (mapping && c.resulting_id) {
        const { data } = await (supabase as any)
          .from(mapping.table)
          .select(`${mapping.textColumn}, subject`)
          .eq("id", c.resulting_id)
          .maybeSingle();
        summaryText = data?.[mapping.textColumn] ?? null;
        subject = data?.subject ?? null;
      }
      return {
        id: c.id,
        contentType: c.classified_as,
        subject,
        confidence: c.confidence,
        savedTable: mapping?.table ?? null,
        summaryText,
        createdAt: c.created_at,
      };
    })
  );
}
