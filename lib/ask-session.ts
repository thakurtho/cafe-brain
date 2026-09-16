import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";
import { fetchEntityCandidates, buildEntityContextText } from "@/lib/entity-candidates";
import { saveTellStyleClassifications, type TellClassificationResult } from "@/lib/classification-writer";
import { buildAskCloseSystemPrompt } from "@/lib/ask-classifier";
import { FINALIZE_TELL_TOOL, type FinalizeTellInput } from "@/lib/tell-classifier";

// Deliberately NOT in app/actions.ts ("use server") — every export in a
// "use server" file becomes a publicly callable endpoint regardless of
// whether the UI ever calls it. closeAskSessionCore/sweepStaleAskSessions
// are only ever invoked from other server code (a real Server Action
// wrapper, or a Server Component's data fetch), so they belong in a plain
// server-only module instead.

// v4 §7: "No answer found → ... → separately, silently logged as a
// knowledge_gap, first-occurrence framing." Written ONCE per session, at
// close — not per turn — so a conversation with several failed follow-ups
// on the same underlying gap produces one knowledge_gap, not several
// (sendAskMessage in app/actions.ts just accumulates the distinct
// unanswered questions onto sessions.flag_reason as they happen). The
// exact-text dedup against an already-open gap from an EARLIER session is
// a simple write-time placeholder for "first occurrence vs recurrence" —
// recognizing the same gap phrased differently, or escalating a
// recurring one, is the deferred async scan's job (v4 §6), not this.
async function recordKnowledgeGapIfFlagged(
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
 * Runs the v4 §7 session-close review over the whole conversation and
 * closes it. Shared by the user-triggered "End conversation" action and
 * the idle-timeout sweep below — same close logic either way.
 */
export async function closeAskSessionCore(
  supabase: ReturnType<typeof createAdminClient>,
  sessionId: string,
  outletId: string,
  userId: string | null
): Promise<TellClassificationResult[]> {
  const { data: historyRows, error } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load conversation: ${error.message}`);

  if (!historyRows || historyRows.length === 0) {
    await recordKnowledgeGapIfFlagged(supabase, outletId, sessionId);
    await supabase.from("sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", sessionId);
    return [];
  }

  const bySubject = await fetchEntityCandidates(supabase, outletId);
  const entityContext = buildEntityContextText(bySubject);

  // The API requires the last message to be role 'user' — every real turn
  // here ends on an assistant answer, so append a synthetic closing
  // instruction rather than replay the transcript as-is.
  const transcriptMessages = [
    ...historyRows.map((m) => ({
      role: m.sender === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text ?? "",
    })),
    { role: "user" as const, content: "[End of conversation. Classify it now per your instructions.]" },
  ];

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1536,
    system: `${buildAskCloseSystemPrompt()}\n\n${entityContext}`,
    messages: transcriptMessages,
    tools: [FINALIZE_TELL_TOOL] as any,
    tool_choice: { type: "tool", name: "finalize_tell" } as any,
  });

  const toolUse = response.content.find((b: any) => b.type === "tool_use") as { input: FinalizeTellInput } | undefined;
  const classifications = toolUse?.input.classifications ?? [
    { content_type: "none", subject: null, summary: "No operational content.", reasoning: "No classification returned.", confidence: 0 },
  ];

  const results = await saveTellStyleClassifications(supabase, {
    outletId,
    sessionId,
    userId,
    classifications,
    bySubject,
  });

  // v4 §7: "Every Ask session still writes a session_classifications row
  // (content_type=query), even on a successful, unremarkable lookup" —
  // always recorded once per session, separate from whatever Tell-style
  // extraction above may have also produced.
  await supabase
    .from("session_classifications")
    .insert({ session_id: sessionId, classified_as: "query", resulting_id: null, confidence: null });

  await recordKnowledgeGapIfFlagged(supabase, outletId, sessionId);

  await supabase.from("sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", sessionId);

  return results;
}

const ASK_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SWEPT_PER_CALL = 3; // caps how much Claude work one page load can trigger

/**
 * Lazy backstop for the 5-minute idle timeout you asked for ("employees
 * may not click the button"). This app has no cron/background-task
 * infrastructure — same "runs opportunistically on page load" pattern
 * already used for Tasks' auto-archive sweep (app/tasks/data.ts). Called
 * from getHomeFeedData() on every Home page load.
 */
export async function sweepStaleAskSessions(outletId: string, userId: string | null): Promise<void> {
  const supabase = createAdminClient();

  const { data: openSessions, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("outlet_id", outletId)
    .eq("mode", "ask")
    .eq("status", "open");
  if (error) throw new Error(`Could not check for idle Ask sessions: ${error.message}`);
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
    if (Date.now() - lastActivity > ASK_IDLE_TIMEOUT_MS) {
      await closeAskSessionCore(supabase, s.id, outletId, userId);
      swept += 1;
    }
  }
}
