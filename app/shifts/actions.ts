"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";
import { requireAccess } from "@/lib/access";
import { APPROVER_TIERS } from "../tasks/tiers";

async function getActingAsPerson(userId: string) {
  if (!userId) throw new Error("Pick who you're acting as first.");
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("users").select("id, name, access_tier").eq("id", userId).single();
  if (error || !data) throw new Error("Unknown acting-as user.");
  return data;
}

export async function requestShiftSwap(formData: FormData) {
  requireAccess();
  const actingAsUserId = String(formData.get("actingAsUserId") ?? "");
  const shiftDate = String(formData.get("shiftDate") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const requester = await getActingAsPerson(actingAsUserId);
  if (!shiftDate) throw new Error("Pick the shift date.");
  if (!startTime || !endTime) throw new Error("Pick the shift's start and end time.");
  if (!reason) throw new Error("Say why you need coverage.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const { error } = await supabase.from("shift_swap_requests").insert({
    outlet_id: outletId,
    requested_by: requester.id,
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    reason,
  });
  if (error) throw new Error(error.message);
}

// Anyone but the original requester can step up — no manager gate here,
// this is a peer offering to help, not an approval action.
export async function volunteerForSwap(formData: FormData) {
  requireAccess();
  const swapId = String(formData.get("swapId") ?? "");
  const volunteer = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));

  const supabase = createAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("shift_swap_requests")
    .select("requested_by, volunteer_id, status")
    .eq("id", swapId)
    .single();
  if (fetchError || !existing) throw new Error("That request isn't there anymore.");
  if (existing.requested_by === volunteer.id) throw new Error("You can't cover your own shift.");
  if (existing.status !== "pending") throw new Error("That request has already been decided.");
  if (existing.volunteer_id) throw new Error("Someone's already volunteered for this one.");

  const { error } = await supabase.from("shift_swap_requests").update({ volunteer_id: volunteer.id }).eq("id", swapId);
  if (error) throw new Error(error.message);
}

// A volunteer can also step back before a manager decides.
export async function withdrawVolunteer(formData: FormData) {
  requireAccess();
  const swapId = String(formData.get("swapId") ?? "");
  const supabase = createAdminClient();
  const { error } = await supabase.from("shift_swap_requests").update({ volunteer_id: null }).eq("id", swapId);
  if (error) throw new Error(error.message);
}

export async function approveSwap(formData: FormData) {
  requireAccess();
  const swapId = String(formData.get("swapId") ?? "");
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  if (!APPROVER_TIERS.has(approver.access_tier)) {
    throw new Error(`${approver.name} isn't a manager or shift lead — can't approve shift swaps.`);
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shift_swap_requests")
    .update({ status: "approved", approved_by: approver.id, approved_at: new Date().toISOString() })
    .eq("id", swapId);
  if (error) throw new Error(error.message);
}

export async function rejectSwap(formData: FormData) {
  requireAccess();
  const swapId = String(formData.get("swapId") ?? "");
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  if (!APPROVER_TIERS.has(approver.access_tier)) {
    throw new Error(`${approver.name} isn't a manager or shift lead — can't reject shift swaps.`);
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shift_swap_requests")
    .update({ status: "rejected", approved_by: approver.id, approved_at: new Date().toISOString() })
    .eq("id", swapId);
  if (error) throw new Error(error.message);
}
