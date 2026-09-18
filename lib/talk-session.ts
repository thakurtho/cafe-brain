import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Deliberately NOT in app/actions.ts ("use server") — every export in a
// "use server" file becomes a publicly callable endpoint regardless of
// whether the UI ever calls it. closeTalkSessionCore/sweepStaleTalkSessions
// are only ever invoked from other server code (a real Server Action
// wrapper, or a Server Component's data fetch), so they belong in a plain
// server-only module instead.

// v4 §7: "No answer found → ... → separately, silently logged as a
// knowledge_gap, first-occurrence framing." Written ONCE per session, at
// close — not per turn — so a conversation with several failed follow-ups
// on the same underlying gap produces one knowledge_gap, not several
// (sendTalkMessage in app/actions.ts just accumulates the distinct
// unanswered questions onto sessions.flag_reason as they happen). The
// exact-text dedup against an already-open gap from an EARLIER session is
// a simple write-time placeholder for "first occurrence vs recurrence" —
// recognizing the same gap phrased differently, or escalating a
// recurring one, is the deferred async scan's job (v4 §6), not this.
export async function recordKnowledgeGapIfFlagged(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: string,
  sessionId: string
): Promise<void> {
  const { data: session } = await supabase
    .from("sessions")
    .select("flagged, flag_reason")
    .eq("id", sessionId)
    .single();
  if (!session?.flagged || !session.flag_reason) return;

  const questionText = session.flag_reason;

  const { data: existing } = await supabase
    .from("knowledge_gaps")
    .select("id, occurrence_count")
    .eq("outlet_id", outletId)
    .eq("status", "open")
    .ilike("question_text", questionText)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("knowledge_gaps")
      .update({ occurrence_count: existing.occurrence_count + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("knowledge_gaps").insert({
      outlet_id: outletId,
      source_session_id: sessionId,
      question_text: questionText,
      occurrence_count: 1,
    });
  }
}

/**
 * Closes a Talk session. Much lighter than the old separate-Ask close
 * step (closeAskSessionCore, removed) — that one had to re-scan the whole
 * transcript with an extra Claude call because Ask never classified
 * anything until the very end. In the unified flow, finalize_tell already
 * records things AS THEY COME UP (see sendTalkMessage), so closing just
 * needs to: write the doc's mandatory "a conversation happened here"
 * marker (still classified_as='query' — the v4 §7 language "even on a
 * successful, unremarkable lookup" generalizes fine to "even on a
 * conversation that logged nothing"), flush any flagged-but-unwritten
 * knowledge gap, and mark it closed. No Claude call needed at all.
 */
export async function closeTalkSessionCore(
  supabase: ReturnType<typeof createAdminClient>,
  sessionId: string,
  outletId: string
): Promise<void> {
  await supabase
    .from("session_classifications")
    .insert({ session_id: sessionId, classified_as: "query", resulting_id: null, confidence: null });

  await recordKnowledgeGapIfFlagged(supabase, outletId, sessionId);

  await supabase.from("sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", sessionId);
}

const TALK_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SWEPT_PER_CALL = 5; // no Claude call per session now, so this can be more generous than the old Ask sweep's cap of 3

/**
 * Lazy backstop for the 5-minute idle timeout ("employees may not click
 * the button"). This app has no cron/background-task infrastructure —
 * same "runs opportunistically on page load" pattern already used for
 * Tasks' auto-archive sweep (app/tasks/data.ts). Called from
 * getHomeFeedData() on every Home page load.
 */
export async function sweepStaleTalkSessions(outletId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: openSessions, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("outlet_id", outletId)
    .eq("mode", "talk")
    .eq("status", "open");
  if (error) throw new Error(`Could not check for idle Talk sessions: ${error.message}`);
  if (!openSessions || openSessions.length === 0) return;

  let swept = 0;
  for (const s of openSessions) {
    if (swept >= MAX_SWEPT_PER_CALL) break;
    const { data: lastMessage } = await supabase
      .from("messages")
      .select("created_at")
      .eq("session_id", s.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastActivity = lastMessage ? new Date(lastMessage.created_at).getTime() : 0;
    if (Date.now() - lastActivity > TALK_IDLE_TIMEOUT_MS) {
      await closeTalkSessionCore(supabase, s.id, outletId);
      swept += 1;
    }
  }
}
