import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * Hardcoded to the single seeded outlet for this test harness — there's no
 * login yet to derive it from a session. Looked up by name rather than a
 * baked-in id, so it keeps working across different Supabase projects.
 */
const MUSAFIR_OUTLET_NAME = "Musafir Cafe — Mussoorie";

export async function getMusafirOutletId(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("outlets")
    .select("id")
    .eq("name", MUSAFIR_OUTLET_NAME)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not find outlet "${MUSAFIR_OUTLET_NAME}" — did supabase/seed/seed.sql run against this project?`
    );
  }
  return data.id;
}

export async function getUserIdByPhone(phone: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("users").select("id").eq("phone", phone).single();

  if (error || !data) {
    throw new Error(`Could not find a user with phone ${phone} — did the seed run?`);
  }
  return data.id;
}
