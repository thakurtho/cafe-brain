"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";
import { requireAccess } from "@/lib/access";

// ⚠️ TEMPORARY (pre-auth stopgap #4 — see app/actions.ts's file header and
// lib/access.ts for the other three). "Acting as" is a plain user id the
// browser sends with every request, with no server-side verification that
// the visitor really is that person. Fine for testing three seeded
// identities locally; remove once real per-user sessions exist and derive
// the actor from the session instead of a client-supplied id.
//
// Note this file's checks are the REAL boundary, same lesson as the access
// gate: the UI hides the Approve button from non-managers, but that's only
// UX. Someone could call approveTask directly with any actingAsUserId, so
// the access_tier check below — not what button the UI happened to show —
// is what actually stops a non-manager approval.

const APPROVER_TIERS = new Set(["shift_manager", "outlet_manager", "gm_owner"]);

async function getActingAsPerson(userId: string) {
  if (!userId) throw new Error("Pick who you're acting as first.");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, access_tier")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error("Unknown acting-as user.");
  return data;
}

function requireApproverTier(person: { name: string; access_tier: string }, verb: string) {
  if (!APPROVER_TIERS.has(person.access_tier)) {
    throw new Error(`${person.name} isn't a manager or shift lead — can't ${verb}.`);
  }
}

export async function createTask(formData: FormData) {
  requireAccess();
  const description = String(formData.get("description") ?? "").trim();
  const actingAsUserId = String(formData.get("actingAsUserId") ?? "");
  const assignTo = String(formData.get("assignTo") ?? "");

  if (!description) throw new Error("Describe the task first.");
  if (!assignTo) throw new Error("Pick who it's for.");

  const creator = await getActingAsPerson(actingAsUserId);
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const isSelf = assignTo === creator.id;

  // Self-assigned tasks skip approval (schema doc, section 5: "Self-
  // assigned tasks skip approval"). Assigning to someone else always
  // needs manager sign-off — including when a manager is the one doing
  // the assigning. No special-casing by who's creating it, on purpose.
  const { error } = await supabase.from("tasks").insert({
    outlet_id: outletId,
    description,
    created_by: creator.id,
    assigned_to: assignTo,
    self_assigned: isSelf,
    status: isSelf ? "approved" : "pending_approval",
    approved_by: isSelf ? creator.id : null,
    approved_at: isSelf ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);
}

export async function approveTask(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(approver, "approve tasks");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "approved", approved_by: approver.id, approved_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function markTaskDone(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function approvePatternAsTask(formData: FormData) {
  requireAccess();
  const patternId = String(formData.get("patternId") ?? "");
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(approver, "approve a suggested task");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const { data: pattern, error: patternError } = await supabase
    .from("patterns")
    .select("id, proposed_action")
    .eq("id", patternId)
    .single();
  if (patternError || !pattern) throw new Error("That suggestion isn't there anymore.");
  if (!pattern.proposed_action) throw new Error("That pattern has no proposed action to turn into a task.");

  // Approving the suggestion IS the approval step — but it still lands
  // unassigned. Who does it goes to is a separate real choice, never an
  // assumption (schema doc, section 11), so this doesn't guess an assignee.
  const { error: taskError } = await supabase.from("tasks").insert({
    outlet_id: outletId,
    description: pattern.proposed_action,
    status: "approved",
    approved_by: approver.id,
    approved_at: new Date().toISOString(),
    self_assigned: false,
  });
  if (taskError) throw new Error(taskError.message);

  await supabase
    .from("patterns")
    .update({ status: "approved", approved_by: approver.id, approved_at: new Date().toISOString() })
    .eq("id", patternId);
}
