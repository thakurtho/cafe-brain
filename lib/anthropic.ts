import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Claude client. Never import this into anything that ships
 * to the browser.
 */
export function createAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Add it to .env.local — get one at console.anthropic.com → API Keys."
    );
  }
  return new Anthropic({ apiKey });
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
