import "server-only";
import type { SubjectTag } from "@/lib/supabase/database.types";

/**
 * Classification rules transcribed from
 * docs/Outlet_Brain_Schema_Living_Doc_v4.md §0–§4 (superseding the v1 doc
 * this file was originally built against). The central correction v4
 * makes: CONTENT TYPE, not subject, decides where something goes. Subject
 * is a tag that rides along for filtering/search — never a fork in logic.
 *
 * Originally built for Tell specifically, then reused as-is for Ask's own
 * session-close review once §7 collapsed Ask into the same pipeline.
 * Ask and Tell have since merged into one conversational flow (see
 * lib/talk-classifier.ts) — these rules didn't need to change for that,
 * since v4 already described them identically for both.
 */

export const SUBJECT_TAGS: Array<{
  value: SubjectTag;
  kind: "entity" | "process";
  label: string;
  entityTable?: "customers" | "vendors" | "users" | "machines" | "menu_items" | "inventory_items" | "facility_areas";
}> = [
  { value: "customer", kind: "entity", label: "Customer", entityTable: "customers" },
  { value: "vendor", kind: "entity", label: "Vendor", entityTable: "vendors" },
  { value: "staff_colleague", kind: "entity", label: "Staff/Colleague", entityTable: "users" },
  { value: "equipment_machine", kind: "entity", label: "Equipment/Machine", entityTable: "machines" },
  { value: "recipe_menu", kind: "entity", label: "Recipe/Menu", entityTable: "menu_items" },
  { value: "inventory_stock", kind: "entity", label: "Inventory/Stock", entityTable: "inventory_items" },
  { value: "facility_premises", kind: "entity", label: "Facility/Premises", entityTable: "facility_areas" },
  { value: "process_sop", kind: "process", label: "Process/SOP" },
  { value: "finance_billing", kind: "process", label: "Finance/Billing" },
  { value: "compliance_safety", kind: "process", label: "Compliance/Safety" },
  { value: "schedule_roster", kind: "process", label: "Schedule/Roster" },
  { value: "competitor_market", kind: "process", label: "Competitor/Market" },
];

// The DB column each entity-subject's entity_id resolves against —
// derived from SUBJECT_TAGS rather than asked from the model, so subject
// and entity_type can never disagree.
export const ENTITY_TYPE_BY_SUBJECT: Partial<Record<SubjectTag, string>> = {
  customer: "customer",
  vendor: "vendor",
  staff_colleague: "user",
  equipment_machine: "machine",
  recipe_menu: "menu_item",
  inventory_stock: "inventory_item",
  facility_premises: "facility_area",
};

// Shared between Tell-style classification and Ask's session-close
// review (v4 §7: "the whole session is scanned at close" using "the exact
// same way a Tell would be") — the content-type/subject rules themselves
// never differ by source, only the framing around them does.
export function buildContentTypeAndSubjectReference(): string {
  const subjectList = SUBJECT_TAGS.map((s) => `- ${s.value} (${s.kind}-subject): ${s.label}`).join("\n");

  return `## Content types (a session can produce MORE THAN ONE — decide independently, don't force a single bucket)
- log: pure FYI. Never required action, at any point. No review, no decision.
- incident: something that required someone to act — whether already resolved or still open. The test is "did action get required," even in the past.
- judgment_call: a discretionary decision the staff member already made on their own (e.g. how they handled a customer complaint). Always attributed, never anonymous.
- task_request: explicitly names something that needs doing.
- none: doesn't fit any of the above — a question, nonsense, or empty content.

Do NOT classify as "pattern" — recurring-issue detection happens later in a separate, periodic scan across many sessions, never decided within one Tell.

## Subject (tag every classification with exactly one, for filtering — never lets it change the content-type logic above)
${subjectList}

- equipment_machine is for durable, installed equipment only (the espresso machine, the grinder) — NOT consumables or tableware. A broken cup, plate, jug, or similar breakable item is inventory_stock, not equipment_machine, even though it "broke."
- inventory_stock covers consumables and stock: ingredients, packaging, AND crockery/glassware/tableware (cups, plates, jugs).

If a specific customer/vendor/staff member/machine/menu item/inventory item/facility area is named, set entity_name to the exact matching name from the candidate lists you're given. If there's no clear match, leave entity_name null — never invent a name that isn't in the provided lists. Process-subjects (process_sop, finance_billing, compliance_safety, schedule_roster, competitor_market) never have an entity_name — there's no discrete "thing" to name.

## Incident-specific rules
- is_safety: true only for a real safety/injury hazard. When true, this ALWAYS forces manager_must_engage regardless of what you'd otherwise pick — never floor_handles for a safety issue.
- response_type: "floor_handles" means a documented SOP already covers the fix and no spend/authorization is needed (e.g. grinder recalibration) — it does NOT mean "low severity," it's passively visible to the manager, not something they need to act on. "manager_must_engage" means it needs spend, a vendor call, or judgment beyond a written procedure.
- resolved_during_session: figure this out before finalizing — ask a follow-up like "is it fixed now? who fixed it?" if the message doesn't already make it clear. A resolved incident still gets tagged incident (it should still weight future pattern detection), it just also gets marked resolved with a resolution_note.
- requires_immediate_call: true only if it's urgent enough to interrupt a manager right now.

## Judgment call
Always attributed — never anonymize. Extract action_taken: what the staff member actually did.

## Wastage (log-only special case)
If the log is about inventory loss — breakage, spoilage — set is_wastage true and fill wastage_item/wastage_quantity, and use subject inventory_stock. Examples that ARE wastage: a broken cup or plate, spilled/spoiled milk, expired stock thrown out. A routine stock check with nothing lost ("milk stock looks fine") is NOT wastage.

## Cash flag (available on log or incident — never changes the content-type decision above)
Set is_cash_related true for anything involving cash handling: till counts, cash float, refunds given in cash, cash safety. A routine cash log with nothing wrong (e.g. "till count done, matches") stays a plain log, just tagged is_cash_related — it does NOT become an incident on its own. Only an actual discrepancy (till doesn't match, cash missing) makes it an incident, still tagged is_cash_related.`;
}

// The old single-purpose Tell prompt (kept only in git history) has been
// replaced by lib/talk-classifier.ts's buildTalkSystemPrompt, which wraps
// buildContentTypeAndSubjectReference with the unified Ask+Tell framing —
// see SCHEMA_NOTES.md for why the two merged.

export const ASK_FOLLOWUP_TOOL = {
  name: "ask_followup",
  description:
    "Ask the staff member one clarifying question before classifying — use only when the answer would genuinely change the classification or routing (e.g. whether an incident is now resolved).",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string" },
    },
    required: ["question"],
  },
};

const subjectEnumWithNull = [...SUBJECT_TAGS.map((s) => s.value), null];

export const FINALIZE_TELL_TOOL = {
  name: "finalize_tell",
  description:
    "Record whatever is reportable in the conversation SO FAR — call this as soon as you have enough information for at least one entry, not just once at the very end. This does NOT end the conversation; the staff member can keep talking afterward. Provide one entry per content type that genuinely applies — usually just one, but a single exchange can legitimately produce more than one (e.g. a resolved incident that's also a judgment call). Only call this when there's something concrete to record; don't call it just to acknowledge a plain answer with nothing new to log.",
  input_schema: {
    type: "object",
    properties: {
      overall_reasoning: { type: "string", description: "One or two sentences on the overall read of this session." },
      classifications: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            content_type: { type: "string", enum: ["log", "incident", "judgment_call", "task_request", "none"] },
            subject: { type: ["string", "null"], enum: subjectEnumWithNull },
            entity_name: { type: ["string", "null"], description: "Must exactly match a name from the provided candidate lists, or null." },
            summary: { type: "string", description: "A clean one-line summary — used as the saved record's summary/description." },
            reasoning: { type: "string" },
            confidence: { type: "number", description: "0 to 1." },
            // incident-only
            is_safety: { type: "boolean" },
            severity: { type: ["string", "null"], enum: ["low", "medium", "high", "critical", null] },
            response_type: { type: ["string", "null"], enum: ["floor_handles", "manager_must_engage", null] },
            requires_immediate_call: { type: "boolean" },
            resolved_during_session: { type: "boolean" },
            resolution_note: { type: ["string", "null"], description: "What happened / who fixed it, if resolved_during_session." },
            // judgment_call-only
            action_taken: { type: ["string", "null"] },
            // log-only (wastage side effect)
            is_wastage: { type: "boolean" },
            wastage_item: { type: ["string", "null"] },
            wastage_quantity: { type: ["number", "null"] },
            // available on log or incident only
            is_cash_related: { type: "boolean" },
          },
          required: ["content_type", "summary", "reasoning", "confidence"],
        },
      },
    },
    required: ["overall_reasoning", "classifications"],
  },
};

export type TellContentType = "log" | "incident" | "judgment_call" | "task_request" | "none";

export type TellClassificationItem = {
  content_type: TellContentType;
  subject?: SubjectTag | null;
  entity_name?: string | null;
  summary: string;
  reasoning: string;
  confidence: number;
  is_safety?: boolean;
  severity?: "low" | "medium" | "high" | "critical" | null;
  response_type?: "floor_handles" | "manager_must_engage" | null;
  requires_immediate_call?: boolean;
  resolved_during_session?: boolean;
  resolution_note?: string | null;
  action_taken?: string | null;
  is_wastage?: boolean;
  wastage_item?: string | null;
  wastage_quantity?: number | null;
  is_cash_related?: boolean;
};

export type FinalizeTellInput = {
  overall_reasoning: string;
  classifications: TellClassificationItem[];
};

export type AskFollowupInput = { question: string };
