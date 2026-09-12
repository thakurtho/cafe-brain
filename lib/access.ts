import "server-only";
import { cookies } from "next/headers";

export const ACCESS_COOKIE = "outlet_brain_access";

/**
 * Fails SAFE, not open: if SITE_ACCESS_CODE isn't set at all, that's fine
 * for local `next dev` (NODE_ENV=development) but treated as locked in a
 * production build/deploy — so forgetting to set the env var on Vercel
 * locks the app out instead of silently leaving it wide open.
 */
export function isUnlocked(): boolean {
  const code = process.env.SITE_ACCESS_CODE;
  if (!code) return process.env.NODE_ENV !== "production";
  return cookies().get(ACCESS_COOKIE)?.value === code;
}

/**
 * Call at the top of every Server Action that touches data or spends API
 * quota. This — not the password screen — is the actual security
 * boundary: a Server Action is a callable network endpoint on its own,
 * reachable whether or not anyone saw the login form.
 */
export function requireAccess(): void {
  if (!isUnlocked()) {
    throw new Error("Not authorized — enter the access code first.");
  }
}
