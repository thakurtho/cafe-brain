"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";
import { getMusafirOutletId } from "@/lib/outlet";
import { requireAccess } from "@/lib/access";
import { DRILL_DOWN_SYSTEM_PROMPT } from "@/lib/drill-down-prompt";

// Drill-down: a follow-up conversation about a specific record. Confirmed
// before building this that Ask and Tell were both strictly one-shot —
// Tell closes its session immediately after classifying, and Ask never
// even creates one. This reuses that SAME sessions/messages capture layer
// rather than inventing a new one: a drill-down is just a session that
// stays 'open' across multiple exchanges, linked to what it's about via
// entity_links (source_type='session', entity_type/entity_id = the
// pattern or task) — entity_links was already built for exactly this
// ("single index for everything about X") and had never been used yet.
//
// Only wired up for patterns and tasks — the only two entity types with
// real cards in the UI today. Observations and incidents don't have a
// list view anywhere in this app yet, so there's nowhere to put a
// "discuss this" button for them; buildEntityContext below is written so
// adding those cases later (once such a view exists) is a small addition,
// not a redesign.

type DrillDownMessage = { sender: string; text: string };

async function buildEntityContext(
  supabase: ReturnType<typeof createAdminClient>,
  entityType: string,
  entityId: string
): Promise<string> {
  if (entityType === "pattern") {
    const { data: pattern } = await supabase
      .from("patterns")
      .select("summary, proposed_action, observation_ids")
      .eq("id", entityId)
      .single();
    if (!pattern) return "This pattern no longer exists.";

    // observation_ids now points at logs post-v4-rebuild (observations was
    // merged into logs, same ids preserved) — column name kept as-is since
    // the async pattern scan that owns this table is still v1-shaped and
    // out of scope for the rebuild.
    let observationsText = "(no observations linked)";
    if (pattern.observation_ids && pattern.observation_ids.length > 0) {
      const { data: obs } = await supabase
        .from("logs")
        .select("summary, created_at")
        .in("id", pattern.observation_ids);
      if (obs && obs.length > 0) {
        observationsText = obs.map((o) => `- ${o.created_at}: ${o.summary}`).join("\n");
      }
    }

    return [
      `This is a PATTERN (a recurring issue Outlet Brain noticed across multiple Tells).`,
      `Summary: ${pattern.summary}`,
      `Proposed action: ${pattern.proposed_action ?? "(none)"}`,
      ``,
      `Linked observations (each is one earlier Tell that contributed to this pattern being recognized):`,
      observationsText,
    ].join("\n");
  }

  if (entityType === "task") {
    const { data: task } = await supabase
      .from("tasks")
      .select("description, status, due_date, resolution_note, requires_proof, proof_type, created_at")
      .eq("id", entityId)
      .single();
    if (!task) return "This task no longer exists.";

    return [
      `This is a TASK.`,
      `Description: ${task.description}`,
      `Status: ${task.status}`,
      `Due date: ${task.due_date}`,
      `Created: ${task.created_at}`,
      task.resolution_note ? `Note on file: ${task.resolution_note}` : "",
      task.requires_proof ? `Requires proof of completion: ${task.proof_type}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return "(No context available for this entity type yet.)";
}

export async function openDrillDown(
  formData: FormData
): Promise<{ sessionId: string; messages: DrillDownMessage[] }> {
  requireAccess();
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const actingAsUserId = String(formData.get("actingAsUserId") ?? "");
  if (!entityType || !entityId) throw new Error("Nothing to discuss.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  // Reuse an existing open drill-down thread about this entity, if one's
  // already been started, instead of always spawning a new one.
  const { data: existingLink } = await supabase
    .from("entity_links")
    .select("source_id")
    .eq("source_type", "session")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sessionId = existingLink?.source_id as string | undefined;

  if (!sessionId) {
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        outlet_id: outletId,
        user_id: actingAsUserId || null,
        initiated_by: "UIC",
        mode: "ask",
        status: "open",
      })
      .select("id")
      .single();
    if (error || !session) throw new Error("Could not start a conversation.");
    sessionId = session.id;
    await supabase
      .from("entity_links")
      .insert({ source_type: "session", source_id: sessionId, entity_type: entityType, entity_id: entityId });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return { sessionId, messages: (messages ?? []).map((m) => ({ sender: m.sender, text: m.text ?? "" })) };
}

export async function sendDrillDownMessage(
  formData: FormData
): Promise<{ messages: DrillDownMessage[] }> {
  requireAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  if (!sessionId) throw new Error("No conversation to reply to.");
  if (!question) throw new Error("Type a question first.");

  const supabase = createAdminClient();

  await supabase.from("messages").insert({ session_id: sessionId, sender: "user", text: question });

  const entityContext = await buildEntityContext(supabase, entityType, entityId);

  const { data: history } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: `${DRILL_DOWN_SYSTEM_PROMPT}\n\nContext:\n${entityContext}`,
    // history strictly alternates user/assistant starting with user, since
    // every turn here is inserted by exactly one of these two actions in
    // that order — safe to map directly to the API's required shape.
    messages: (history ?? []).map((m) => ({
      role: m.sender === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text ?? "",
    })),
  });

  const answerText = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  await supabase.from("messages").insert({ session_id: sessionId, sender: "assistant", text: answerText });

  const { data: updated } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return { messages: (updated ?? []).map((m) => ({ sender: m.sender, text: m.text ?? "" })) };
}
