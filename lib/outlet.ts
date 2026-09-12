import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * Hardcoded to the single seeded outlet for this test harness — there's no
 * login yet to derive it from a session. Looked up by name rather than a
 * baked-in id, so it keeps working across different Supabase projects.
 */
const MUSAFIR_OUTLET_NAME = "Musafir Cafe — Mussoorie";

/**
 * Host only, never the key — lets a mismatched-project misconfiguration
 * (right key shape, wrong project) be diagnosed straight from a log line
 * instead of manually comparing dashboard values.
 */
function currentSupabaseHost(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "(NEXT_PUBLIC_SUPABASE_URL not set)";
  try {
    return new URL(url).host;
  } catch {
    return `(invalid NEXT_PUBLIC_SUPABASE_URL: "${url}")`;
  }
}

export async function getMusafirOutletId(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("outlets")
    .select("id")
    .eq("name", MUSAFIR_OUTLET_NAME)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not find outlet "${MUSAFIR_OUTLET_NAME}" in Supabase project ${currentSupabaseHost()} — ` +
        `did supabase/seed/seed.sql run against THIS project? Check that ` +
        `NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY point to the same ` +
        `project you seeded, not a different one.`
    );
  }
  return data.id;
}

export async function getUserIdByPhone(phone: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("users").select("id").eq("phone", phone).single();

  if (error || !data) {
    throw new Error(
      `Could not find a user with phone ${phone} in Supabase project ${currentSupabaseHost()} — did the seed run against THIS project?`
    );
  }
  return data.id;
}
