import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";
import { getTasksPageData } from "../tasks/data";
import { getShiftsPageData } from "../shifts/data";
import { getBroadcastsPageData } from "../broadcasts/data";

export type KnowledgeGapRow = { id: string; questionText: string; escalationLevel: string };
export type DiscrepancyRow = { id: string; note: string | null };

/**
 * A thin aggregator, not a new source of truth — every trigger the
 * notification list surfaces is computed from data the other three
 * features already fetch and own (tasks, patterns/compliance, swaps,
 * broadcasts). No separate "notifications" table; nothing here is
 * persisted read/unread state, just a live view of "what needs your
 * attention right now" (see NotificationsApp for why).
 *
 * knowledge_gaps and shift_openings.discrepancy_flagged are queried
 * defensively even though nothing in this app currently writes to either
 * — no knowledge-gap escalation flow and no shift-handover UI exist yet,
 * so both always come back empty today. Kept so the notification logic is
 * already correct the moment either flow gets built, rather than another
 * thing to remember to wire up later.
 */
export async function getNotificationsPageData() {
  const [{ people, tasks, suggestions, complianceCards }, { requests: swaps }, { broadcasts }] = await Promise.all([
    getTasksPageData(),
    getShiftsPageData(),
    getBroadcastsPageData(),
  ]);

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const [knowledgeGapsResult, discrepanciesResult] = await Promise.all([
    supabase.from("knowledge_gaps").select("id, question_text, escalation_level").eq("outlet_id", outletId).eq("status", "open"),
    supabase.from("shift_openings").select("id, discrepancy_note").eq("outlet_id", outletId).eq("discrepancy_flagged", true),
  ]);

  // See app/tasks/data.ts for why this check matters — a real query
  // failure otherwise silently turns into an empty list here too.
  if (knowledgeGapsResult.error) throw new Error(`Could not load knowledge gaps: ${knowledgeGapsResult.error.message}`);
  if (discrepanciesResult.error) throw new Error(`Could not load shift discrepancies: ${discrepanciesResult.error.message}`);

  const knowledgeGapsRaw = knowledgeGapsResult.data;
  const discrepanciesRaw = discrepanciesResult.data;

  const knowledgeGaps: KnowledgeGapRow[] = (knowledgeGapsRaw ?? []).map((k) => ({
    id: k.id,
    questionText: k.question_text,
    escalationLevel: k.escalation_level,
  }));
  const discrepancies: DiscrepancyRow[] = (discrepanciesRaw ?? []).map((d) => ({ id: d.id, note: d.discrepancy_note }));

  return { people, tasks, suggestions, complianceCards, swaps, broadcasts, knowledgeGaps, discrepancies };
}
