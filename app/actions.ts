"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";
import { getMusafirOutletId, getUserIdByPhone } from "@/lib/outlet";
import {
  buildTellSystemPrompt,
  ASK_FOLLOWUP_TOOL,
  FINALIZE_TELL_TOOL,
  SUBJECT_TAGS,
  ENTITY_TYPE_BY_SUBJECT,
  MAX_FOLLOWUPS,
  type FinalizeTellInput,
  type AskFollowupInput,
  type TellClassificationItem,
} from "@/lib/tell-classifier";
import type { SubjectTag } from "@/lib/supabase/database.types";
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

const VALID_TELL_CONTENT_TYPES = new Set(["log", "incident", "judgment_call", "task_request", "none"]);

export type TellMessage = { sender: string; text: string };

export type TellClassificationResult = {
  contentType: string;
  subject: string | null;
  reasoning: string;
  confidence: number;
  savedTable: string | null;
  savedRecord: Record<string, unknown> | null;
};

export type TellTurnResult = {
  sessionId: string;
  messages: TellMessage[];
  done: boolean;
  results: TellClassificationResult[] | null;
};

// Fetch every entity-subject's candidate names in one go, so the model
// always has the full list to resolve entity_name against (v4 §0's 7
// entity-subjects) — mirrors the same "provide candidates, never let the
// model invent a name" rule the original classifier used for just
// machines/customers.
async function fetchEntityCandidates(supabase: ReturnType<typeof createAdminClient>, outletId: string) {
  const [machines, customers, vendors, users, menuItems, inventoryItems, facilityAreas] = await Promise.all([
    supabase.from("machines").select("id, name").eq("outlet_id", outletId),
    supabase.from("customers").select("id, name").eq("outlet_id", outletId),
    supabase.from("vendors").select("id, name").eq("outlet_id", outletId),
    supabase.from("users").select("id, name").eq("outlet_id", outletId),
    supabase.from("menu_items").select("id, name").eq("outlet_id", outletId),
    supabase.from("inventory_items").select("id, name").eq("outlet_id", outletId),
    supabase.from("facility_areas").select("id, name").eq("outlet_id", outletId),
  ]);

  const bySubject: Partial<Record<SubjectTag, { id: string; name: string }[]>> = {
    equipment_machine: machines.data ?? [],
    customer: customers.data ?? [],
    vendor: vendors.data ?? [],
    staff_colleague: users.data ?? [],
    recipe_menu: menuItems.data ?? [],
    inventory_stock: inventoryItems.data ?? [],
    facility_premises: facilityAreas.data ?? [],
  };
  return bySubject;
}

function buildEntityContextText(bySubject: Partial<Record<SubjectTag, { id: string; name: string }[]>>): string {
  return SUBJECT_TAGS.filter((s) => s.kind === "entity")
    .map((s) => `Known ${s.label} names: ${(bySubject[s.value] ?? []).map((r) => r.name).join(", ") || "(none)"}`)
    .join("\n");
}

function resolveEntity(
  item: TellClassificationItem,
  bySubject: Partial<Record<SubjectTag, { id: string; name: string }[]>>
): { entityType: string | null; entityId: string | null } {
  const subject = item.subject ?? null;
  if (!subject || !item.entity_name) return { entityType: null, entityId: null };
  const candidates = bySubject[subject];
  const match = candidates?.find((c) => c.name === item.entity_name);
  if (!match) return { entityType: null, entityId: null };
  return { entityType: ENTITY_TYPE_BY_SUBJECT[subject] ?? null, entityId: match.id };
}

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
    results = [];

    for (const rawItem of input.classifications) {
      // content_type is declared "required" in the tool schema, but the
      // API doesn't hard-validate a tool call's input against that schema
      // server-side — the model can still omit or misspell it. Normalize
      // here so a malformed entry degrades to "none" instead of crashing
      // every downstream .contentType read (switch below, the closing
      // summary text, and the client's results panel).
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

// Home's updates feed (v4 §1): "Drag-to-archive is a manual, per-item
// action available here — never automatic."
export async function archiveLog(logId: string): Promise<void> {
  requireAccess();
  const supabase = createAdminClient();
  const { error } = await supabase.from("logs").update({ archived: true }).eq("id", logId);
  if (error) throw new Error(`Could not archive: ${error.message}`);
}
