"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";
import { requireAccess } from "@/lib/access";
import { APPROVER_TIERS } from "./tiers";

// ⚠️ TEMPORARY (pre-auth stopgap #4 — see app/actions.ts's file header and
// lib/access.ts for the other three). "Acting as" is a plain user id the
// browser sends with every request, with no server-side verification that
// the visitor really is that person. Fine for testing three seeded
// identities locally; remove once real per-user sessions exist and derive
// the actor from the session instead of a client-supplied id.
//
// Note this file's checks are the REAL boundary, same lesson as the access
// gate: the UI hides manager-only controls from non-managers, but that's
// only UX. Someone could call these actions directly with any
// actingAsUserId, so the access_tier checks below — not what the UI
// happened to show — are what actually stop a non-manager action.

const PROOF_BUCKET = "task-proofs";
// Matches next.config.mjs's serverActions.bodySizeLimit and the bucket's
// file_size_limit in the proof-storage migration — three places that all
// need to agree, so if you raise one, raise all three.
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

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
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const requiresProof = formData.get("requiresProof") === "on";
  const proofType = String(formData.get("proofType") ?? "").trim();

  if (!description) throw new Error("Describe the task first.");
  if (!assignTo) throw new Error("Pick who it's for.");
  if (requiresProof && !proofType) throw new Error("Pick what kind of proof this task needs.");

  const creator = await getActingAsPerson(actingAsUserId);
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const isSelf = assignTo === creator.id;

  // Self-assigned tasks always skip approval (schema doc, section 5).
  // Anyone assigning a task to someone else needs a manager's approval —
  // deliberately no special-casing for a manager assigning it themselves;
  // the approval step is the same regardless of who's creating it.
  const { error } = await supabase.from("tasks").insert({
    outlet_id: outletId,
    description,
    created_by: creator.id,
    assigned_to: assignTo,
    self_assigned: isSelf,
    due_date: dueDate || null,
    requires_proof: requiresProof,
    proof_type: requiresProof ? (proofType as "photo" | "reading" | "voice" | "confirm") : null,
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

function classifyUploadedProof(mimeType: string): "photo" | "voice" {
  return mimeType.startsWith("audio/") ? "voice" : "photo";
}

export async function markTaskDone(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const proofValue = String(formData.get("proofValue") ?? "").trim();
  const file = formData.get("proofFile");
  const hasFile = file instanceof File && file.size > 0;

  const supabase = createAdminClient();

  const { data: task, error: taskFetchError } = await supabase
    .from("tasks")
    .select("requires_proof, proof_type")
    .eq("id", taskId)
    .single();
  if (taskFetchError || !task) throw new Error("That task isn't there anymore.");

  let proofMediaPath: string | null = null;

  if (task.requires_proof) {
    if (task.proof_type === "photo" || task.proof_type === "voice") {
      if (!hasFile) {
        throw new Error(
          task.proof_type === "photo"
            ? "This task needs a photo before it can be marked done."
            : "This task needs a voice recording before it can be marked done."
        );
      }
      const proofFile = file as File;
      if (proofFile.size > MAX_PROOF_BYTES) throw new Error("That file is too big — keep proof under 10MB for now.");

      const detected = classifyUploadedProof(proofFile.type);
      if (detected !== task.proof_type) {
        throw new Error(`This task needs a ${task.proof_type}, not a ${detected === "voice" ? "voice recording" : "photo"}.`);
      }

      const ext = proofFile.name.includes(".") ? proofFile.name.split(".").pop() : detected;
      const path = `${taskId}/${Date.now()}-${randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(path, proofFile, { contentType: proofFile.type || undefined });
      if (uploadError) throw new Error(`Proof upload failed: ${uploadError.message}`);
      proofMediaPath = path;
    } else if (task.proof_type === "reading") {
      if (!proofValue) throw new Error("This task needs a reading (a number or short value) before it can be marked done.");
    }
    // 'confirm' needs nothing beyond the act of marking done itself.
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      resolution_note: note || null,
      ...(proofMediaPath ? { proof_media_path: proofMediaPath } : {}),
      ...(task.proof_type === "reading" && proofValue ? { proof_value: proofValue } : {}),
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

// "Genuinely blocked" branch of the can't-complete conversation (see
// TaskItem in tasks-app.tsx) — logs why, flags it for a manager by putting
// it back in the To approve/review column rather than leaving it to sit
// unnoticed in Done.
export async function markTaskBlocked(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("Say why it couldn't be completed.");

  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").update({ status: "blocked", resolution_note: note }).eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function archiveTask(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").update({ archived: true }).eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function approvePatternAsTask(formData: FormData) {
  requireAccess();
  const patternId = String(formData.get("patternId") ?? "");
  const assignTo = String(formData.get("assignTo") ?? "");
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(approver, "approve a suggested task");
  if (!assignTo) throw new Error("Pick who it's for.");

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const { data: pattern, error: patternError } = await supabase
    .from("patterns")
    .select("id, proposed_action")
    .eq("id", patternId)
    .single();
  if (patternError || !pattern) throw new Error("That suggestion isn't there anymore.");
  if (!pattern.proposed_action) throw new Error("That pattern has no proposed action to turn into a task.");

  // Approving the suggestion IS the approval step. created_by is left
  // null on purpose — this task didn't come from a person, it came from
  // the system recognizing a pattern; the UI shows that as "System-
  // assigned" rather than "Assigned by unknown". source_pattern_id keeps
  // the lineage so priority can be derived from it later.
  const { error: taskError } = await supabase.from("tasks").insert({
    outlet_id: outletId,
    description: pattern.proposed_action,
    assigned_to: assignTo,
    status: "approved",
    approved_by: approver.id,
    approved_at: new Date().toISOString(),
    self_assigned: false,
    source_pattern_id: patternId,
  });
  if (taskError) throw new Error(taskError.message);

  await supabase
    .from("patterns")
    .update({ status: "approved", approved_by: approver.id, approved_at: new Date().toISOString() })
    .eq("id", patternId);
}
