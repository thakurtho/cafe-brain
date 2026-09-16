"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";
import { getMusafirOutletId, getUserIdByPhone } from "@/lib/outlet";
import {
  buildTellSystemPrompt,
  ASK_FOLLOWUP_TOOL,
  FINALIZE_TELL_TOOL,
  MAX_FOLLOWUPS,
  type FinalizeTellInput,
  type AskFollowupInput,
} from "@/lib/tell-classifier";
import { fetchEntityCandidates, buildEntityContextText } from "@/lib/entity-candidates";
import { saveTellStyleClassifications, type TellClassificationResult } from "@/lib/classification-writer";
export type { TellClassificationResult };
import { ANSWER_QUESTION_TOOL, buildAskAnswerSystemPrompt, type AnswerQuestionInput } from "@/lib/ask-classifier";
import { closeAskSessionCore } from "@/lib/ask-session";
import { ACCESS_COOKIE, requireAccess } from "@/lib/access";
import { ACTING_AS_PHONE } from "@/lib/acting-as";

// ⚠️ This file has THREE pre-auth stopgaps, all temporary, all removable
// only once real per-user login exists (a fourth — a client-picked
// "acting as" user, replacing ACTING_AS_PHONE's single hardcoded person —
// lives in app/tasks/actions.ts for the Tasks feature):
//   1. requireAccess() / unlock() below — one shared password for every
//      visitor instead of real login. See lib/access.ts.
//   2. ACTING_AS_PHONE further down — every Tell is attributed to one
//      hardcoded seeded user instead of whoever's actually signed in.
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

export type TellMessage = { sender: string; text: string };

export type TellTurnResult = {
  sessionId: string;
  messages: TellMessage[];
  done: boolean;
  results: TellClassificationResult[] | null;
};

// Open a fresh Tell session — mirrors drill-down's openDrillDown, just
// without an entity_links row since a Tell isn't "about" a pre-existing
// record the way a drill-down conversation is.
export async function openTellSession(): Promise<{ sessionId: string; messages: TellMessage[] }> {
  requireAccess();
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const userId = await getUserIdByPhone(ACTING_AS_PHONE);

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ outlet_id: outletId, user_id: userId, initiated_by: "UIC", mode: "tell", status: "open" })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Failed to open a session.");

  return { sessionId: session.id, messages: [] };
}

export async function sendTellMessage(formData: FormData): Promise<TellTurnResult> {
  requireAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!sessionId) throw new Error("No Tell session to reply to.");
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

  const followupCount = (historyRows ?? []).filter((m) => m.sender === "assistant").length;
  const forceFinalize = followupCount >= MAX_FOLLOWUPS;

  const bySubject = await fetchEntityCandidates(supabase, outletId);
  const entityContext = buildEntityContextText(bySubject);

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1536,
    system: `${buildTellSystemPrompt()}\n\n${entityContext}`,
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
    tools: (forceFinalize ? [FINALIZE_TELL_TOOL] : [ASK_FOLLOWUP_TOOL, FINALIZE_TELL_TOOL]) as any,
    tool_choice: (forceFinalize ? { type: "tool", name: "finalize_tell" } : { type: "any" }) as any,
  });

  const toolUse = response.content.find((b: any) => b.type === "tool_use") as
    | { name: string; input: AskFollowupInput | FinalizeTellInput }
    | undefined;
  if (!toolUse) throw new Error("Claude didn't return a follow-up question or a classification.");

  let results: TellClassificationResult[] | null = null;
  let done = false;

  if (toolUse.name === "ask_followup") {
    const input = toolUse.input as AskFollowupInput;
    await supabase.from("messages").insert({ session_id: sessionId, sender: "assistant", text: input.question });
  } else {
    const input = toolUse.input as FinalizeTellInput;
    results = await saveTellStyleClassifications(supabase, {
      outletId,
      sessionId,
      userId,
      classifications: input.classifications,
      bySubject,
    });

    const closingText =
      results.length === 0 || results.every((r) => r.contentType === "none")
        ? "Got it — nothing needed here."
        : `Got it. Logged as: ${results.map((r) => r.contentType.replace("_", " ")).join(", ")}.`;
    await supabase.from("messages").insert({ session_id: sessionId, sender: "assistant", text: closingText });
    await supabase.from("sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", sessionId);
    done = true;
  }

  const { data: updated } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return {
    sessionId,
    messages: (updated ?? []).map((m) => ({ sender: m.sender, text: m.text ?? "" })),
    done,
    results,
  };
}

async function buildAskReferenceContext(supabase: ReturnType<typeof createAdminClient>, outletId: string): Promise<string> {
  const [
    { data: menuItems },
    { data: recipes },
    { data: customers },
    { data: vendors },
    { data: sops },
    { data: trainingModules },
    { data: complianceReminders },
  ] = await Promise.all([
    supabase.from("menu_items").select("name, category, price").eq("outlet_id", outletId),
    // Relationship embedding isn't modeled in the hand-rolled Database
    // type yet, hence `any` here.
    (supabase as any)
      .from("recipes")
      .select("steps, menu_items(name)")
      .eq("outlet_id", outletId),
    supabase.from("customers").select("name, phone, preferences").eq("outlet_id", outletId),
    supabase.from("vendors").select("name, category, supplies").eq("outlet_id", outletId),
    supabase.from("sops").select("topic, content").eq("outlet_id", outletId),
    supabase.from("training_modules").select("title, content").eq("outlet_id", outletId),
    supabase.from("compliance_reminders").select("topic, status, due_date, reminder_date").eq("outlet_id", outletId),
  ]);

  return [
    "## Menu",
    ...(menuItems ?? []).map((m) => `- ${m.name} (${m.category}) — ₹${m.price}`),
    "",
    "## Recipes",
    ...(recipes ?? []).map((r: any) => `### ${r.menu_items?.name ?? "Unknown item"}\n${r.steps}`),
    "",
    "## Customers",
    ...(customers ?? []).map((c) => `- ${c.name} (${c.phone}): ${c.preferences}`),
    "",
    "## Vendors",
    ...(vendors ?? []).map((v) => `- ${v.name} (${v.category}): ${v.supplies}`),
    "",
    "## SOPs",
    ...(sops ?? []).map((s) => `### ${s.topic}\n${s.content}`),
    "",
    "## Training modules",
    ...(trainingModules ?? []).map((t) => `### ${t.title}\n${t.content}`),
    "",
    "## Compliance",
    ...(complianceReminders ?? []).map((c) => `- ${c.topic}: ${c.status} (due ${c.due_date})`),
  ].join("\n");
}

// A miss is recorded on the SESSION as it happens (flagged + flag_reason
// accumulating the distinct unanswered questions), NOT written to
// knowledge_gaps yet — the actual write happens once, at session close
// (see closeAskSessionCore in lib/ask-session.ts), so a conversation with
// three failed follow-ups on the same underlying gap produces ONE
// knowledge_gap, not three.
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

export type AskTurnResult = { sessionId: string; messages: TellMessage[] };

// Open a fresh Ask session — v4 §7 collapses Ask into Tell's pipeline, so
// it now gets the same session/messages capture layer Tell has, instead
// of being stateless.
export async function openAskSession(): Promise<{ sessionId: string; messages: TellMessage[] }> {
  requireAccess();
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const userId = await getUserIdByPhone(ACTING_AS_PHONE);

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ outlet_id: outletId, user_id: userId, initiated_by: "UIC", mode: "ask", status: "open" })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Failed to open a session.");

  return { sessionId: session.id, messages: [] };
}

export async function sendAskMessage(formData: FormData): Promise<AskTurnResult> {
  requireAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  const question = String(formData.get("text") ?? "").trim();
  if (!sessionId) throw new Error("No Ask session to reply to.");
  if (!question) throw new Error("Type a question first.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  await supabase.from("messages").insert({ session_id: sessionId, sender: "user", text: question });

  const { data: historyRows, error: historyErr } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (historyErr) throw new Error(`Could not load conversation: ${historyErr.message}`);

  const context = await buildAskReferenceContext(supabase, outletId);

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: `${buildAskAnswerSystemPrompt()}\n\nReference data for Musafir Cafe:\n\n${context}`,
    messages: (historyRows ?? []).map((m) => ({
      role: m.sender === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text ?? "",
    })),
    tools: [ANSWER_QUESTION_TOOL] as any,
    tool_choice: { type: "tool", name: "answer_question" } as any,
  });

  const toolUse = response.content.find((b: any) => b.type === "tool_use") as { input: AnswerQuestionInput } | undefined;
  if (!toolUse) throw new Error("Claude didn't return an answer.");
  const input = toolUse.input;

  await supabase.from("messages").insert({ session_id: sessionId, sender: "assistant", text: input.answer_text });

  if (!input.found_answer) {
    await flagUnansweredQuestion(supabase, sessionId, question);
  }

  const { data: updated } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return { sessionId, messages: (updated ?? []).map((m) => ({ sender: m.sender, text: m.text ?? "" })) };
}

// User-triggered "End conversation" — runs the v4 §7 session-close review
// (see closeAskSessionCore) over the whole thread. The idle-timeout
// backstop (lib/ask-session.ts's sweepStaleAskSessions, called from
// getHomeFeedData on page load) runs the exact same core logic when an
// employee doesn't click this.
export async function closeAskSession(formData: FormData): Promise<{ results: TellClassificationResult[] }> {
  requireAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("No Ask session to close.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const userId = await getUserIdByPhone(ACTING_AS_PHONE);

  const results = await closeAskSessionCore(supabase, sessionId, outletId, userId);
  return { results };
}

// Home's updates feed (v4 §1): "Drag-to-archive is a manual, per-item
// action available here — never automatic."
export async function archiveLog(logId: string): Promise<void> {
  requireAccess();
  const supabase = createAdminClient();
  const { error } = await supabase.from("logs").update({ archived: true }).eq("id", logId);
  if (error) throw new Error(`Could not archive: ${error.message}`);
}
