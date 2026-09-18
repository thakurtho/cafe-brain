import "server-only";

/**
 * The "answer a question" move inside the unified Talk flow
 * (lib/talk-classifier.ts) — this file used to hold Ask's own separate
 * system prompts (per-turn answering + a whole-transcript close review)
 * from before Ask and Tell merged into one conversation; both prompts are
 * now unified in buildTalkSystemPrompt, so only the tool itself remains
 * here.
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
