import "server-only";

/**
 * Classification rules transcribed from docs/Outlet_Brain_Schema_Living_Doc.md
 * (sections 4–5, and the "customer tagging" / pattern-detection notes).
 */
export const TELL_SYSTEM_PROMPT = `You classify a raw staff report ("Tell") for Outlet Brain, a café operations system, into exactly one of: observation, fyi, task, pattern, incident, or none.

Definitions:
- observation: something noted that happened, worth recording, but doesn't by itself require action (e.g. "Machine 2 was slow again this morning").
- fyi: purely informational, no follow-up needed (e.g. "New pastry vendor started deliveries today").
- task: something that needs to be done (e.g. "Reorder oat milk before Friday").
- pattern: this report clearly matches one or more entries in the RECENT OBSERVATIONS list provided to you (same entity, a recurring issue). Only choose this if there's a genuine match in that list — never on a first-time report, even if it sounds like it could recur.
- incident: something that needs resolution — safety issues, breakages, equipment failures needing a fix, or a customer complaint escalated beyond a simple on-the-spot remake. Decide response_type: "floor_handles" if the reporting staffer already resolved it themselves with no lasting issue (e.g. swept up broken glass, no injury); "manager_must_engage" if a manager still needs to act. Set is_safety true only for a real safety/injury hazard. Set requires_immediate_call true only if it's urgent enough to interrupt a manager right now rather than sit in a queue.
- none: doesn't fit any of the above (e.g. a question rather than a report, nonsense, empty content).

If the report clearly names a specific machine or customer, set entity_type and entity_name to the exact matching name from the provided candidate lists. If there's no clear match in those lists, set both to null — never invent a name that isn't in the provided lists.

Always call the classify_tell tool with your answer. confidence is your own calibrated 0–1 estimate for this classification.`;

export const CLASSIFY_TOOL = {
  name: "classify_tell",
  description:
    "Classify a Tell submission and extract the fields needed to save it to the right table.",
  input_schema: {
    type: "object",
    properties: {
      classification: {
        type: "string",
        enum: ["observation", "fyi", "task", "pattern", "incident", "none"],
      },
      reasoning: {
        type: "string",
        description: "One or two sentences on why this classification was chosen.",
      },
      summary: {
        type: "string",
        description: "A clean one-line summary of what happened — used as the saved record's summary/description.",
      },
      confidence: { type: "number", description: "0 to 1." },
      entity_type: {
        type: ["string", "null"],
        enum: ["machine", "customer", "menu_item", null],
      },
      entity_name: {
        type: ["string", "null"],
        description: "Must exactly match a name from the provided candidate lists, or null.",
      },
      is_safety: { type: "boolean", description: "Only meaningful when classification is incident." },
      severity: {
        type: ["string", "null"],
        enum: ["low", "medium", "high", "critical", null],
      },
      response_type: {
        type: ["string", "null"],
        enum: ["floor_handles", "manager_must_engage", null],
      },
      requires_immediate_call: { type: "boolean" },
      proposed_action: {
        type: ["string", "null"],
        description: "Only meaningful when classification is pattern — a suggested SOP/process change.",
      },
      matches_prior_observation_ids: {
        type: "array",
        items: { type: "string" },
        description: "IDs copied from the provided recent-observations list. Only meaningful when classification is pattern.",
      },
    },
    required: ["classification", "reasoning", "summary", "confidence"],
  },
};

export type ClassifyTellInput = {
  classification: "observation" | "fyi" | "task" | "pattern" | "incident" | "none";
  reasoning: string;
  summary: string;
  confidence: number;
  entity_type?: "machine" | "customer" | "menu_item" | null;
  entity_name?: string | null;
  is_safety?: boolean;
  severity?: "low" | "medium" | "high" | "critical" | null;
  response_type?: "floor_handles" | "manager_must_engage" | null;
  requires_immediate_call?: boolean;
  proposed_action?: string | null;
  matches_prior_observation_ids?: string[];
};
