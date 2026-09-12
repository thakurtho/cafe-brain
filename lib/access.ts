import "server-only";
import { cookies } from "next/headers";

// ⚠️ TEMPORARY (pre-auth stopgap) — remove this whole file once real
// per-user login exists (Supabase Auth phone OTP is already the chosen
// strategy — see supabase/migrations/20260911140100_core_org_tables.sql
// and lib/supabase/server.ts). One shared password for every visitor is
// only acceptable because there's no login screen yet; it is not a
// substitute for one. When real auth lands, delete this file, app/gate.tsx,
// the unlock() action and requireAccess() calls in app/actions.ts, and the
// SITE_ACCESS_CODE env var — access control should come entirely from an
// authenticated session + the RLS policies already in place, not a shared
// secret. (See the ACTING_AS_PHONE comment in app/actions.ts for the other
// two stopgaps tied to this same gap.)

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
