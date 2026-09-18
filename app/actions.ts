"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";
import { getMusafirOutletId, getUserIdByPhone } from "@/lib/outlet";
import {
  ASK_FOLLOWUP_TOOL,
  FINALIZE_TELL_TOOL,
  type FinalizeTellInput,
  type AskFollowupInput,
} from "@/lib/tell-classifier";
import { buildTalkSystemPrompt, MAX_TALK_TURNS_BEFORE_LIMITING_FOLLOWUPS } from "@/lib/talk-classifier";
import { ANSWER_QUESTION_TOOL, type AnswerQuestionInput } from "@/lib/ask-classifier";
import { searchKnowledgeChunks, buildKnowledgeContextText } from "@/lib/knowledge-search";
import { buildEntityCandidatesFromChunks, buildEntityContextText } from "@/lib/entity-candidates";
import { saveTellStyleClassifications, type TellClassificationResult } from "@/lib/classification-writer";
export type { TellClassificationResult };
import { closeTalkSessionCore } from "@/lib/talk-session";
import { ACCESS_COOKIE, requireAccess } from "@/lib/access";
import { ACTING_AS_PHONE } from "@/lib/acting-as";

// ⚠️ This file has THREE pre-auth stopgaps, all temporary, all removable
// only once real per-user login exists (a fourth — a client-picked
// "acting as" user, replacing ACTING_AS_PHONE's single hardcoded person —
// lives in app/tasks/actions.ts for the Tasks feature):
//   1. requireAccess() / unlock() below — one shared password for every
//      visitor instead of real login. See lib/access.ts.
//   2. ACTING_AS_PHONE further down — every conversation is attributed to
//      one hardcoded seeded user instead of whoever's actually signed in.
//   3. createAdminClient() (service role) throughout this file — RLS is
//      bypassed entirely and outlet-scoping is done by hand in each query,
//      because there's no authenticated session for RLS to key off yet.
// When real auth lands: delete requireAccess/unlock and lib/access.ts;
// thread the real signed-in user in place of ACTING_AS_PHONE (and Tasks'
// acting-as toggle); and switch these Server Actions to
// lib/supabase/server.ts's cookie-aware client so RLS (already fully
// written — see the migrations' RLS file) does the access control instead
// of manual outlet_id filtering.

export async function unlock(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const entered = String(formData.get("code") ?? "");
  const code = process.env.SITE_ACCESS_CODE;

  if (!code) {
    // Nothing configured. isUnlocked() already treats this as open in dev
    // and locked in production, so there's nothing to check against here.
    return { ok: process.env.NODE_ENV !== "production" };
  }
  if (entered !== code) return { ok: false, error: "Wrong code." };

  cookies().set(ACCESS_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
  return { ok: true };
}

// A miss is recorded on the SESSION as it happens (flagged + flag_reason
// accumulating the distinct unanswered questions), NOT written to
// knowledge_gaps yet — the actual write happens once, at session close
// (see lib/talk-session.ts), so a conversation with several failed
// follow-ups on the same underlying gap produces ONE knowledge_gap, not
// several.
async function flagUnansweredQuestion(
  supabase: ReturnType<typeof createAdminClient>,
  sessionId: string,
  questionText: string
): Promise<void> {
  const { data: session } = await supabase.from("sessions").select("flag_reason").eq("id", sessionId).single();
  const existing = session?.flag_reason ?? "";
  const already = existing
    .split("; ")
    .some((q) => q.trim().toLowerCase() === questionText.trim().toLowerCase());
  const updatedReason = already ? existing : existing ? `${existing}; ${questionText}` : questionText;

  await supabase.from("sessions").update({ flagged: true, flag_reason: updatedReason }).eq("id", sessionId);
}

export type TalkMessage = { sender: string; text: string };

export type TalkTurnResult = {
  sessionId: string;
  messages: TalkMessage[];
  // Whatever finalize_tell recorded on THIS turn, if anything — null on a
  // follow-up question or a plain answer with nothing new to log.
  results: TellClassificationResult[] | null;
};

// Ask and Tell merged into one conversation (confirmed with you: a floor
// employee doesn't naturally separate "reporting" from "asking" — the
// cash-shortage example was both in one breath). Opens a session the same
// way both predecessors did.
export async function openTalkSession(): Promise<{ sessionId: string; messages: TalkMessage[] }> {
  requireAccess();
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const userId = await getUserIdByPhone(ACTING_AS_PHONE);

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ outlet_id: outletId, user_id: userId, initiated_by: "UIC", mode: "talk", status: "open" })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Failed to open a session.");

  return { sessionId: session.id, messages: [] };
}

export async function sendTalkMessage(formData: FormData): Promise<TalkTurnResult> {
  requireAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!sessionId) throw new Error("No conversation to reply to.");
  if (!text) throw new Error("Type something first.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const userId = await getUserIdByPhone(ACTING_AS_PHONE);

  await supabase.from("messages").insert({ session_id: sessionId, sender: "user", text });

  const { data: historyRows, error: historyErr } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (historyErr) throw new Error(`Could not load conversation: ${historyErr.message}`);

  // Safety valve against endless clarifying questions — NOT a "close after
  // N turns" cap like the old separate Tell flow had, since a unified
  // conversation is expected to run longer. Just drops ask_followup once
  // the conversation's gone on a while, leaving answer_question and
  // finalize_tell available either way.
  const assistantTurnCount = (historyRows ?? []).filter((m) => m.sender === "assistant").length;
  const allowFollowup = assistantTurnCount < MAX_TALK_TURNS_BEFORE_LIMITING_FOLLOWUPS;

  // One search covers both needs this turn might have — relevant
  // knowledge to answer a question, and relevant named entities to
  // resolve if this turn ends up getting logged — replacing what used to
  // be two separate full-table dumps.
  const chunks = await searchKnowledgeChunks(supabase, outletId, text, 12);
  const knowledgeContext = buildKnowledgeContextText(chunks);
  const bySubject = buildEntityCandidatesFromChunks(chunks);
  const entityContext = buildEntityContextText(bySubject);

  const anthropic = createAnthropicClient();
  const tools = allowFollowup
    ? [ASK_FOLLOWUP_TOOL, ANSWER_QUESTION_TOOL, FINALIZE_TELL_TOOL]
    : [ANSWER_QUESTION_TOOL, FINALIZE_TELL_TOOL];

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1536,
    system: `${buildTalkSystemPrompt()}\n\n${entityContext}\n\nReference material for Musafir Cafe (closest matches to what was just said):\n\n${knowledgeContext}`,
    // Strictly alternating plain-text user/assistant turns — tool calls
    // are translated to plain assistant text before being persisted (see
    // below), never stored or replayed as raw tool_use blocks. Same
    // convention as sendDrillDownMessage in drill-down-actions.ts.
    messages: (historyRows ?? []).map((m) => ({
      role: m.sender === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text ?? "",
    })),
    // Cast defensively throughout: this sandbox can't run tsc against the
    // installed SDK to confirm these tool schemas' inferred shape exactly
    // matches its Tool type. The JSON schema itself is what matters at
    // runtime.
    tools: tools as any,
    tool_choice: { type: "any" } as any,
  });

  const toolUse = response.content.find((b: any) => b.type === "tool_use") as
    | { name: string; input: AskFollowupInput | AnswerQuestionInput | FinalizeTellInput }
    | undefined;
  if (!toolUse) throw new Error("Claude didn't return a response.");

  let results: TellClassificationResult[] | null = null;

  if (toolUse.name === "ask_followup") {
    const input = toolUse.input as AskFollowupInput;
    await supabase.from("messages").insert({ session_id: sessionId, sender: "assistant", text: input.question });
  } else if (toolUse.name === "answer_question") {
    const input = toolUse.input as AnswerQuestionInput;
    await supabase.from("messages").insert({ session_id: sessionId, sender: "assistant", text: input.answer_text });
    if (!input.found_answer) {
      await flagUnansweredQuestion(supabase, sessionId, text);
    }
  } else {
    const input = toolUse.input as FinalizeTellInput;
    results = await saveTellStyleClassifications(supabase, {
      outletId,
      sessionId,
      userId,
      classifications: input.classifications,
      bySubject,
    });
    const loggedTypes = results.filter((r) => r.contentType !== "none").map((r) => r.contentType.replace("_", " "));
    const confirmText = loggedTypes.length === 0 ? "Noted." : `Got it. Logged as: ${loggedTypes.join(", ")}.`;
    await supabase.from("messages").insert({ session_id: sessionId, sender: "assistant", text: confirmText });
  }

  const { data: updated } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return {
    sessionId,
    messages: (updated ?? []).map((m) => ({ sender: m.sender, text: m.text ?? "" })),
    results,
  };
}

// User-triggered "End conversation." The idle-timeout backstop
// (lib/talk-session.ts's sweepStaleTalkSessions, called from
// getHomeFeedData on page load) runs the exact same close logic when an
// employee doesn't click this.
export async function endTalkSession(formData: FormData): Promise<void> {
  requireAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("No conversation to end.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  await closeTalkSessionCore(supabase, sessionId, outletId);
}

// Home's updates feed (v4 §1): "Drag-to-archive is a manual, per-item
// action available here — never automatic."
export async function archiveLog(logId: string): Promise<void> {
  requireAccess();
  const supabase = createAdminClient();
  const { error } = await supabase.from("logs").update({ archived: true }).eq("id", logId);
  if (error) throw new Error(`Could not archive: ${error.message}`);
}
