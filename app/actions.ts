"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";
import { getMusafirOutletId, getUserIdByPhone } from "@/lib/outlet";
import { TELL_SYSTEM_PROMPT, CLASSIFY_TOOL, type ClassifyTellInput } from "@/lib/tell-classifier";
import { ASK_SYSTEM_PROMPT } from "@/lib/ask-prompt";
import { ACCESS_COOKIE, requireAccess } from "@/lib/access";

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

// ⚠️ TEMPORARY (pre-auth stopgap #2 — see file header). Aman Rawat
// (Captain / Senior Barista), from the seed data.
const ACTING_AS_PHONE = "+919876510002";

export type TellResult = {
  classification: ClassifyTellInput["classification"];
  reasoning: string;
  confidence: number;
  savedTable: string | null;
  savedRecord: Record<string, unknown> | null;
};

export async function submitTell(formData: FormData): Promise<TellResult> {
  requireAccess();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("Type something to submit first.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const userId = await getUserIdByPhone(ACTING_AS_PHONE);

  // 1. Open a session and log the raw message — the capture layer, same
  // shape a real voice Tell would produce.
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .insert({ outlet_id: outletId, user_id: userId, initiated_by: "UIC", mode: "tell", status: "open" })
    .select("id")
    .single();
  if (sessionErr || !session) throw new Error(sessionErr?.message ?? "Failed to open a session.");

  await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });

  // 2. Context for the classifier: known entities to resolve names against,
  // and recent observations so it can actually recognize a pattern.
  const [{ data: machines }, { data: customers }, { data: recentObservations }] = await Promise.all([
    supabase.from("machines").select("id, name").eq("outlet_id", outletId),
    supabase.from("customers").select("id, name").eq("outlet_id", outletId),
    supabase
      .from("observations")
      .select("id, summary")
      .eq("outlet_id", outletId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const priorObservationsText =
    (recentObservations ?? []).map((o) => `- [${o.id}] ${o.summary}`).join("\n") || "(none logged yet)";

  // 3. Classify via Claude tool-use (forced tool call — always structured).
  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: TELL_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Message to classify: "${text}"`,
          "",
          `Known machines at this outlet: ${(machines ?? []).map((m) => m.name).join(", ") || "(none)"}`,
          `Known customers at this outlet: ${(customers ?? []).map((c) => c.name).join(", ") || "(none)"}`,
          "",
          "Recent observations logged at this outlet (for spotting a recurring pattern):",
          priorObservationsText,
        ].join("\n"),
      },
    ],
    // Cast defensively: this sandbox can't run tsc against the installed
    // SDK to confirm CLASSIFY_TOOL's inferred shape exactly matches its
    // Tool type. The JSON schema itself is what matters at runtime.
    tools: [CLASSIFY_TOOL as any],
    tool_choice: { type: "tool", name: "classify_tell" } as any,
  });

  // Duck-typed rather than importing the SDK's block types directly — this
  // sandbox can't run tsc against the installed package to confirm exact
  // type export paths for the pinned SDK version.
  const toolUse = response.content.find((b: any) => b.type === "tool_use") as
    | { input: ClassifyTellInput }
    | undefined;
  if (!toolUse) throw new Error("Claude didn't return a classification.");
  const input = toolUse.input;

  // 4. Resolve entity_name -> a real id from the lists we already fetched.
  let entityId: string | null = null;
  if (input.entity_type === "machine" && input.entity_name) {
    entityId = machines?.find((m) => m.name === input.entity_name)?.id ?? null;
  } else if (input.entity_type === "customer" && input.entity_name) {
    entityId = customers?.find((c) => c.name === input.entity_name)?.id ?? null;
  }
  const entityType = entityId ? input.entity_type ?? null : null;

  // 5. Save to the table the classification points at.
  let savedTable: string | null = null;
  let savedRecord: Record<string, unknown> | null = null;

  switch (input.classification) {
    case "observation": {
      const { data } = await supabase
        .from("observations")
        .insert({
          outlet_id: outletId,
          source_session_id: session.id,
          entity_type: entityType,
          entity_id: entityId,
          summary: input.summary,
          status: "open",
        })
        .select()
        .single();
      savedTable = "observations";
      savedRecord = data;
      break;
    }
    case "fyi": {
      const { data } = await supabase
        .from("fyis")
        .insert({ outlet_id: outletId, source_session_id: session.id, summary: input.summary })
        .select()
        .single();
      savedTable = "fyis";
      savedRecord = data;
      break;
    }
    case "task": {
      // No assignee picker in this thin slice, and the schema doc is
      // explicit that a task's destination is never auto-assigned — so it
      // lands unassigned, pending someone deciding who it's for.
      //
      // due_date is now required on every task (Sept 13 Tasks feedback),
      // but the classifier doesn't infer one from the Tell text — a
      // Tell-created task gets a flat 3-day-out placeholder rather than
      // guessing a real deadline. A manager can adjust it from the Tasks
      // board (updateTaskDetails in app/tasks/actions.ts) once it's
      // reviewed. Worth revisiting if this matters more than a placeholder.
      const placeholderDueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("tasks")
        .insert({
          outlet_id: outletId,
          source_session_id: session.id,
          description: input.summary,
          status: "pending_approval",
          created_by: userId,
          self_assigned: false,
          due_date: placeholderDueDate,
        })
        .select()
        .single();
      savedTable = "tasks";
      savedRecord = data;
      break;
    }
    case "incident": {
      const { data } = await supabase
        .from("incidents")
        .insert({
          outlet_id: outletId,
          source_session_id: session.id,
          entity_type: entityType,
          entity_id: entityId,
          is_safety: input.is_safety ?? false,
          severity: input.severity ?? null,
          description: input.summary,
          status: "open",
          response_type: input.response_type ?? "manager_must_engage",
          requires_immediate_call: input.requires_immediate_call ?? false,
        })
        .select()
        .single();
      savedTable = "incidents";
      savedRecord = data;
      break;
    }
    case "pattern": {
      const knownIds = new Set((recentObservations ?? []).map((o) => o.id));
      const observationIds = (input.matches_prior_observation_ids ?? []).filter((id) => knownIds.has(id));
      const { data } = await supabase
        .from("patterns")
        .insert({
          outlet_id: outletId,
          entity_type: entityType,
          entity_id: entityId,
          observation_ids: observationIds,
          summary: input.summary,
          proposed_action: input.proposed_action ?? null,
          status: "pending",
          brand_visible: false,
        })
        .select()
        .single();
      savedTable = "patterns";
      savedRecord = data;
      break;
    }
    case "none":
      break;
  }

  // 6. Log the classification and close the session out.
  await supabase.from("session_classifications").insert({
    session_id: session.id,
    classified_as: input.classification,
    resulting_id: (savedRecord?.id as string | undefined) ?? null,
    confidence: input.confidence,
  });
  await supabase.from("sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", session.id);

  return {
    classification: input.classification,
    reasoning: input.reasoning,
    confidence: input.confidence,
    savedTable,
    savedRecord,
  };
}

export type AskResult = { answer: string };

export async function submitAsk(formData: FormData): Promise<AskResult> {
  requireAccess();
  const question = String(formData.get("question") ?? "").trim();
  if (!question) throw new Error("Type a question first.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

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

  const context = [
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

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: ASK_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `Reference data for Musafir Cafe:\n\n${context}\n\nQuestion: ${question}` },
    ],
  });

  const answer = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  return { answer };
}
