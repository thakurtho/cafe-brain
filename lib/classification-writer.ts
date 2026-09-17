import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { type TellClassificationItem } from "@/lib/tell-classifier";
import { resolveEntity, type EntityCandidates } from "@/lib/entity-candidates";

const VALID_TELL_CONTENT_TYPES = new Set(["log", "incident", "judgment_call", "task_request", "none"]);

export type TellClassificationResult = {
  contentType: string;
  subject: string | null;
  reasoning: string;
  confidence: number;
  savedTable: string | null;
  savedRecord: Record<string, unknown> | null;
};

/**
 * Saves a batch of Tell-style classifications (log/incident/judgment_call/
 * task_request/none) and their session_classifications rows. Shared by
 * Tell's own finalize step and Ask's session-close review (v4 §7) — same
 * content types, same tables, same rules, regardless of which produced
 * them.
 */
export async function saveTellStyleClassifications(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    outletId: string;
    sessionId: string;
    userId: string | null;
    classifications: TellClassificationItem[];
    bySubject: EntityCandidates;
  }
): Promise<TellClassificationResult[]> {
  const { outletId, sessionId, userId, classifications, bySubject } = params;
  const results: TellClassificationResult[] = [];

  for (const rawItem of classifications) {
    // content_type is declared "required" in the tool schema, but the API
    // doesn't hard-validate a tool call's input against that schema
    // server-side — the model can still omit or misspell it. Normalize
    // here so a malformed entry degrades to "none" instead of crashing
    // every downstream .contentType read.
    const item: TellClassificationItem = {
      ...rawItem,
      content_type: VALID_TELL_CONTENT_TYPES.has(rawItem.content_type) ? rawItem.content_type : "none",
    };
    const { entityType, entityId } = resolveEntity(item, bySubject);
    let savedTable: string | null = null;
    let savedRecord: Record<string, unknown> | null = null;

    switch (item.content_type) {
      case "log": {
        const { data, error } = await supabase
          .from("logs")
          .insert({
            outlet_id: outletId,
            source_session_id: sessionId,
            subject: item.subject ?? null,
            entity_type: entityType,
            entity_id: entityId,
            summary: item.summary,
            archived: false,
            is_cash_related: item.is_cash_related ?? false,
          })
          .select()
          .single();
        if (error) throw new Error(`Could not save log: ${error.message}`);
        savedTable = "logs";
        savedRecord = data;

        // Wastage side effect (v4 §1): a log about inventory loss also
        // opens a wastage_entries row, pending in Approve/Review — never
        // shown on Home until approved + synced, never duplicated here.
        if (item.is_wastage) {
          await supabase.from("wastage_entries").insert({
            outlet_id: outletId,
            source_session_id: sessionId,
            item: item.wastage_item ?? item.summary,
            quantity: item.wastage_quantity ?? null,
            reason: item.summary,
            status: "pending_approval",
          });
        }
        break;
      }
      case "incident": {
        // Safety hard-forces manager_must_engage in code, not just via
        // prompt wording (v4 §2: "Safety/injury always forces
        // mgr_must_engage, overriding the normal floor/manager split").
        const isSafety = item.is_safety ?? false;
        const responseType = isSafety ? "manager_must_engage" : item.response_type ?? "manager_must_engage";
        const resolvedNow = item.resolved_during_session ?? false;
        const { data, error } = await supabase
          .from("incidents")
          .insert({
            outlet_id: outletId,
            source_session_id: sessionId,
            subject: item.subject ?? null,
            entity_type: entityType,
            entity_id: entityId,
            is_safety: isSafety,
            is_cash_related: item.is_cash_related ?? false,
            severity: item.severity ?? null,
            description: item.summary,
            status: resolvedNow ? "resolved" : "open",
            resolved_by: resolvedNow ? userId : null,
            resolved_at: resolvedNow ? new Date().toISOString() : null,
            resolution_note: item.resolution_note ?? null,
            response_type: responseType,
            requires_immediate_call: item.requires_immediate_call ?? false,
          })
          .select()
          .single();
        if (error) throw new Error(`Could not save incident: ${error.message}`);
        savedTable = "incidents";
        savedRecord = data;
        break;
      }
      case "judgment_call": {
        const { data, error } = await supabase
          .from("judgment_calls")
          .insert({
            outlet_id: outletId,
            session_id: sessionId,
            user_id: userId,
            subject: item.subject ?? null,
            situation: item.summary,
            action_taken: item.action_taken ?? null,
          })
          .select()
          .single();
        if (error) throw new Error(`Could not save judgment call: ${error.message}`);
        savedTable = "judgment_calls";
        savedRecord = data;
        break;
      }
      case "task_request": {
        // Same placeholder-due-date rationale as before this rebuild:
        // due_date is required on every task, but the classifier doesn't
        // infer a real deadline from free-form Tell text.
        const placeholderDueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            outlet_id: outletId,
            source_session_id: sessionId,
            subject: item.subject ?? null,
            description: item.summary,
            status: "pending_approval",
            created_by: userId,
            self_assigned: false,
            due_date: placeholderDueDate,
          })
          .select()
          .single();
        if (error) throw new Error(`Could not save task: ${error.message}`);
        savedTable = "tasks";
        savedRecord = data;
        break;
      }
      case "none":
        break;
    }

    await supabase.from("session_classifications").insert({
      session_id: sessionId,
      classified_as: item.content_type,
      resulting_id: (savedRecord?.id as string | undefined) ?? null,
      confidence: item.confidence,
    });

    results.push({
      contentType: item.content_type,
      subject: item.subject ?? null,
      reasoning: item.reasoning,
      confidence: item.confidence,
      savedTable,
      savedRecord,
    });
  }

  return results;
}
