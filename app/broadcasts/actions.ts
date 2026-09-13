"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";
import { requireAccess } from "@/lib/access";
import { APPROVER_TIERS } from "../tasks/tiers";
import type { AccessTier } from "@/lib/supabase/database.types";

const VALID_ACCESS_TIERS = new Set(["floor_staff", "shift_manager", "outlet_manager", "gm_owner"]);

async function getActingAsPerson(userId: string) {
  if (!userId) throw new Error("Pick who you're acting as first.");
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("users").select("id, name, access_tier").eq("id", userId).single();
  if (error || !data) throw new Error("Unknown acting-as user.");
  return data;
}

// Any manager/shift-lead can broadcast, same tier as task approval —
// matches the schema doc's Outlet Updates screen access (Shift Manager
// and above, outlet-scoped).
export async function sendBroadcast(formData: FormData) {
  requireAccess();
  const message = String(formData.get("message") ?? "").trim();
  const targetAccessTier = String(formData.get("targetAccessTier") ?? "").trim();
  const important = formData.get("important") === "on";
  const sender = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));

  if (!APPROVER_TIERS.has(sender.access_tier)) {
    throw new Error(`${sender.name} isn't a manager or shift lead — can't send broadcasts.`);
  }
  if (!message) throw new Error("Write something to broadcast first.");
  if (targetAccessTier && !VALID_ACCESS_TIERS.has(targetAccessTier)) {
    throw new Error("Unrecognized target audience.");
  }

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const { error } = await supabase.from("broadcasts").insert({
    outlet_id: outletId,
    sender_id: sender.id,
    message,
    target_access_tier: (targetAccessTier || null) as AccessTier | null,
    important,
  });
  if (error) throw new Error(error.message);
}

export async function acknowledgeBroadcast(formData: FormData) {
  requireAccess();
  const broadcastId = String(formData.get("broadcastId") ?? "");
  const userId = String(formData.get("actingAsUserId") ?? "");
  if (!userId) throw new Error("Pick who you're acting as first.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("broadcast_acknowledgements")
    .upsert({ broadcast_id: broadcastId, user_id: userId }, { onConflict: "broadcast_id,user_id" });
  if (error) throw new Error(error.message);
}
