import "server-only";
import { buildContentTypeAndSubjectReference } from "@/lib/tell-classifier";

/**
 * Ask, rebuilt against Schema Living Doc v4 §7 ("Ask fully collapses into
 * Tell's pipeline. Not a special case."). Two separate moments, matching
 * the doc's own three bullets:
 *   1. Per-turn: answer the question, and explicitly say whether a real
 *      answer was actually found — drives an immediate knowledge_gap
 *      write on a miss (see sendAskMessage in app/actions.ts).
 *   2. At session close: re-scan the WHOLE conversation, Tell-style, for
 *      any operational fact plus the mandatory baseline "query"
 *      session_classifications row (see closeAskSessionCore).
 */

export const ANSWER_QUESTION_TOOL = {
  name: "answer_question",
  description:
    "Answer the staff member's question using only the provided reference data, and say whether you actually found a real answer in it.",
  input_schema: {
    type: "object",
    properties: {
      found_answer: {
        type: "boolean",
        description: "True only if the reference data actually contained the answer. False if you're saying you don't know.",
      },
      answer_text: {
        type: "string",
        description:
          "What to say back to the staff member — the real answer, or a plain \"I don't have that — ask your manager\" if found_answer is false.",
      },
    },
    required: ["found_answer", "answer_text"],
  },
};

export type AnswerQuestionInput = { found_answer: boolean; answer_text: string };

export function buildAskAnswerSystemPrompt(): string {
  return `You answer staff questions for Musafir Cafe using ONLY the reference data provided below, across a multi-turn conversation — the staff member can ask follow-ups in the same thread, so use earlier turns for context (e.g. "what about the iced version" after asking about a hot drink).

Rules:
- Answer only from the provided data. Never invent details, prices, names, or steps that aren't in it.
- If the exact thing asked about isn't in the data, set found_answer to false — even if you can offer a nearby substitution or related item as a courtesy (e.g. "we don't have a vegan latte, but here's the oat milk swap for an iced latte"). Offering a helpful workaround does NOT mean the answer was found; found_answer reflects whether the actual question was answered, not whether you were able to say something useful.
- Keep answers short and practical, the way you'd actually tell a barista what to do on the floor.
- When useful, name which record you pulled the answer from (e.g. "Recipes → Cappuccino").
- Always call answer_question with your answer.`;
}

export function buildAskCloseSystemPrompt(): string {
  return `A staff member's Ask conversation with Outlet Brain has just ended. Review the WHOLE conversation transcript above (not just the last message) for anything worth capturing as its own operational record — the same rules Tell uses for a fresh report:

${buildContentTypeAndSubjectReference()}

Most Ask conversations are pure lookups with nothing else to capture — that's normal, respond with a single classification entry of content_type "none" in that case. Only extract additional entries when the conversation itself narrated something beyond the lookup (e.g. the question or answer revealed an incident, a task that needs doing, or a discretionary call the staff member made) — don't manufacture significance that isn't there.`;
}
