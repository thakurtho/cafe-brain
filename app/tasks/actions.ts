"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";
import { requireAccess } from "@/lib/access";
import { APPROVER_TIERS, ADMIN_TIERS } from "./tiers";

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
const VALID_PROOF_TYPES = new Set(["text", "photo", "video", "audio"]);

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

function requireAdminTier(person: { name: string; access_tier: string }, verb: string) {
  if (!ADMIN_TIERS.has(person.access_tier)) {
    throw new Error(`${person.name} isn't an outlet manager — can't ${verb}.`);
  }
}

function readProofTypeField(formData: FormData, requiresProof: boolean): "text" | "photo" | "video" | "audio" | null {
  if (!requiresProof) return null;
  const proofType = String(formData.get("proofType") ?? "").trim();
  if (!VALID_PROOF_TYPES.has(proofType)) throw new Error("Pick what kind of proof this task needs.");
  return proofType as "text" | "photo" | "video" | "audio";
}

export async function createTask(formData: FormData) {
  requireAccess();
  const description = String(formData.get("description") ?? "").trim();
  const actingAsUserId = String(formData.get("actingAsUserId") ?? "");
  const assignTo = String(formData.get("assignTo") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const requiresProof = formData.get("requiresProof") === "on";

  if (!description) throw new Error("Describe the task first.");
  if (!assignTo) throw new Error("Pick who it's for.");
  if (!dueDate) throw new Error("Every task needs a due date now.");
  const proofType = readProofTypeField(formData, requiresProof);

  const creator = await getActingAsPerson(actingAsUserId);
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const isSelf = assignTo === creator.id;

  // Self-assigned tasks always skip approval (schema doc, section 5) but
  // are still ordinary tasks — always visible to a manager viewing the
  // team board, never a separate "personal reminder" concept. Anyone
  // assigning a task to someone else needs a manager's approval,
  // deliberately with no special-casing for a manager assigning it
  // themselves — the approval step is the same regardless of creator.
  const { error } = await supabase.from("tasks").insert({
    outlet_id: outletId,
    description,
    created_by: creator.id,
    assigned_to: assignTo,
    self_assigned: isSelf,
    due_date: dueDate,
    requires_proof: requiresProof,
    proof_type: proofType,
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

// General manager control over any visible, non-terminal task: due date,
// proof requirement, description (scope), and who it's assigned to — one
// form covers "just tweak a setting" and "delegate this to someone else"
// (same or different person), since they're the same underlying action.
// Reassigning away from a blocked or pending state sends it back to
// "To complete" as approved for the new holder, exactly like a fresh
// dispatch — a manager actively choosing an assignee IS the approval.
export async function updateTaskDetails(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const assignTo = String(formData.get("assignTo") ?? "").trim();
  const requiresProof = formData.get("requiresProof") === "on";
  const editor = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(editor, "edit tasks");

  if (!dueDate) throw new Error("Every task needs a due date.");
  if (!description) throw new Error("Every task needs a description.");
  if (!assignTo) throw new Error("Pick who it's for.");
  const proofType = readProofTypeField(formData, requiresProof);

  const supabase = createAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select("status, assigned_to")
    .eq("id", taskId)
    .single();
  if (fetchError || !existing) throw new Error("That task isn't there anymore.");

  const reassigning = assignTo !== existing.assigned_to;
  const wasBlocked = existing.status === "blocked";
  // Reassigning (to anyone, including back to the same person after being
  // blocked) or clearing a blocked task dispatches it fresh into the
  // to-do queue. Just tweaking a due date on a still-pending task does
  // NOT grant approval on its own — that stays a separate, deliberate step.
  const dispatch = reassigning || wasBlocked;

  const { error } = await supabase
    .from("tasks")
    .update({
      due_date: dueDate,
      description,
      assigned_to: assignTo,
      requires_proof: requiresProof,
      proof_type: proofType,
      ...(dispatch
        ? {
            status: "approved",
            approved_by: editor.id,
            approved_at: new Date().toISOString(),
            resolution_note: null,
            extension_requested: false,
            requested_due_date: null,
            extension_reason: null,
          }
        : {}),
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

function classifyUploadedProof(mimeType: string): "photo" | "video" | "audio" | "unknown" {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "unknown";
}

// Only tasks that require proof go through manager review — nothing else
// to verify for a plain task, so it goes straight to Done, same as
// before. requires_proof is already tracked per-task (not globally),
// which is exactly what makes this scoping possible without a new flag.
export async function markTaskDone(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
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

  if (!task.requires_proof) {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
    return;
  }

  let proofMediaPath: string | null = null;

  if (task.proof_type === "text") {
    if (!proofValue) throw new Error("This task needs a text note before it can be marked done.");
  } else if (task.proof_type === "photo" || task.proof_type === "video" || task.proof_type === "audio") {
    if (!hasFile) throw new Error(`This task needs a ${task.proof_type} before it can be marked done.`);
    const proofFile = file as File;
    if (proofFile.size > MAX_PROOF_BYTES) throw new Error("That file is too big — keep proof under 10MB for now.");

    const detected = classifyUploadedProof(proofFile.type);
    if (detected !== task.proof_type) {
      throw new Error(`This task needs a ${task.proof_type}, but that file looks like a ${detected}.`);
    }

    const ext = proofFile.name.includes(".") ? proofFile.name.split(".").pop() : detected;
    const path = `${taskId}/${Date.now()}-${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(path, proofFile, { contentType: proofFile.type || undefined });
    if (uploadError) throw new Error(`Proof upload failed: ${uploadError.message}`);
    proofMediaPath = path;
  }

  // Submitting proof doesn't finish the task — status stays 'approved',
  // it just now also carries completion_status='pending_review', which
  // is what pulls it into "To approve/review" for a manager to look at
  // (see the kanban filtering in tasks-app.tsx).
  const { error } = await supabase
    .from("tasks")
    .update({
      completion_status: "pending_review",
      completed_at: new Date().toISOString(),
      ...(proofMediaPath ? { proof_media_path: proofMediaPath } : {}),
      ...(task.proof_type === "text" && proofValue ? { proof_value: proofValue } : {}),
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function acceptTaskCompletion(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const reviewer = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(reviewer, "review task completions");

  const supabase = createAdminClient();
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("source_compliance_id, proof_media_path, proof_type, proof_value")
    .eq("id", taskId)
    .single();
  if (fetchError || !task) throw new Error("That task isn't there anymore.");

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completion_status: "accepted",
      completion_reviewed_by: reviewer.id,
      completion_reviewed_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  // Same compliance-clearing logic as before, now happens on manager
  // acceptance rather than on the assignee's raw submission — a
  // compliance-delegated task always requires proof, so it always goes
  // through this review step first.
  if (task.source_compliance_id) {
    const proofReference =
      task.proof_media_path ?? (task.proof_type === "text" ? task.proof_value : null) ?? "Cleared via linked task completion";
    await supabase
      .from("compliance_reminders")
      .update({ status: "cleared", proof_document_url: proofReference, cleared_by: reviewer.id })
      .eq("id", task.source_compliance_id);
  }
}

// Rejection freezes the rejected attempt as history (archived, status set
// to the existing but previously-unused 'rejected' task_status value —
// proof/notes/timestamp all stay exactly as submitted) rather than
// resetting it, and spawns a fresh row carrying the same description,
// assignment, due date, and proof requirement, linked back via
// reopened_from_completion_id. That new row is what actually reappears in
// "To complete" — the old one stays visible, untouched, in Archived.
export async function rejectTaskCompletion(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const reviewer = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(reviewer, "review task completions");
  if (!reason) throw new Error("Explain what needs fixing before rejecting.");

  const supabase = createAdminClient();
  const { data: task, error: fetchError } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (fetchError || !task) throw new Error("That task isn't there anymore.");

  const { error: freezeError } = await supabase
    .from("tasks")
    .update({
      status: "rejected",
      completion_status: "rejected",
      rejection_reason: reason,
      completion_reviewed_by: reviewer.id,
      completion_reviewed_at: new Date().toISOString(),
      archived: true,
    })
    .eq("id", taskId);
  if (freezeError) throw new Error(freezeError.message);

  const { error: reopenError } = await supabase.from("tasks").insert({
    outlet_id: task.outlet_id,
    description: task.description,
    created_by: task.created_by,
    assigned_to: task.assigned_to,
    self_assigned: task.self_assigned,
    due_date: task.due_date,
    requires_proof: task.requires_proof,
    proof_type: task.proof_type,
    source_pattern_id: task.source_pattern_id,
    source_incident_id: task.source_incident_id,
    source_compliance_id: task.source_compliance_id,
    status: "approved",
    approved_by: reviewer.id,
    approved_at: new Date().toISOString(),
    reopened_from_completion_id: taskId,
  });
  if (reopenError) throw new Error(reopenError.message);
}

// "Genuinely blocked" branch of the can't-complete conversation (see
// TaskCard in tasks-app.tsx) — logs why, flags it for a manager by putting
// it back in the To approve/review column rather than leaving it to sit
// unnoticed in Done. A manager resolves it via updateTaskDetails
// (reassign to the same or a different person) or archiveTask (dismiss).
export async function markTaskBlocked(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("Say why it couldn't be completed.");

  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").update({ status: "blocked", resolution_note: note }).eq("id", taskId);
  if (error) throw new Error(error.message);
}

// The "I could still finish it" -> still couldn't branch: ask for more
// time instead of declaring the task fully blocked. Doesn't change status
// — the task stays visibly "To complete" for its holder — it just also
// surfaces in "To approve/review" for a manager to decide on.
export async function requestDeadlineExtension(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const requestedDueDate = String(formData.get("requestedDueDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!requestedDueDate) throw new Error("Pick the date you're asking for.");
  if (!reason) throw new Error("Say why you need more time.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tasks")
    .update({ extension_requested: true, requested_due_date: requestedDueDate, extension_reason: reason })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function approveDeadlineExtension(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(approver, "approve deadline extensions");

  const supabase = createAdminClient();
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("requested_due_date")
    .eq("id", taskId)
    .single();
  if (fetchError || !task || !task.requested_due_date) throw new Error("No extension request found on that task.");

  const { error } = await supabase
    .from("tasks")
    .update({
      due_date: task.requested_due_date,
      extension_requested: false,
      requested_due_date: null,
      extension_reason: null,
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function denyDeadlineExtension(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(approver, "deny deadline extensions");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tasks")
    .update({ extension_requested: false, requested_due_date: null, extension_reason: null })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

// Manual archive — stays available alongside the auto-archive setting
// below, not replaced by it.
export async function archiveTask(formData: FormData) {
  requireAccess();
  const taskId = String(formData.get("taskId") ?? "");
  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").update({ archived: true }).eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function updateAutoArchiveSetting(formData: FormData) {
  requireAccess();
  const raw = String(formData.get("autoArchiveDays") ?? "").trim();
  const editor = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireAdminTier(editor, "change this setting");

  const days = raw ? Number(raw) : null;
  if (raw && (!Number.isInteger(days) || (days as number) <= 0)) {
    throw new Error("Auto-archive days must be a whole number greater than 0, or blank to disable it.");
  }

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();
  const { error } = await supabase.from("outlets").update({ auto_archive_done_after_days: days }).eq("id", outletId);
  if (error) throw new Error(error.message);
}

export async function approvePatternAsTask(formData: FormData) {
  requireAccess();
  const patternId = String(formData.get("patternId") ?? "");
  const assignTo = String(formData.get("assignTo") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const requiresProof = formData.get("requiresProof") === "on";
  const approver = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireApproverTier(approver, "approve a suggested task");
  if (!assignTo) throw new Error("Pick who it's for.");
  if (!dueDate) throw new Error("Every task needs a due date.");
  const proofType = readProofTypeField(formData, requiresProof);

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
    due_date: dueDate,
    requires_proof: requiresProof,
    proof_type: proofType,
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

// Turns a compliance reminder into a real, closeable, delegable task.
// Compliance clearing structurally requires proof (schema doc: "Status
// can't clear without proof_document_url uploaded" — enforced by a CHECK
// constraint on compliance_reminders), so requires_proof is always true
// here; the admin only picks which kind. Admin-tier only (outlet_manager/
// gm_owner), matching compliance's own visibility gating — not the
// broader shift_manager-and-up set used for ordinary task approval.
export async function delegateComplianceTask(formData: FormData) {
  requireAccess();
  const complianceId = String(formData.get("complianceId") ?? "");
  const assignTo = String(formData.get("assignTo") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const editor = await getActingAsPerson(String(formData.get("actingAsUserId") ?? ""));
  requireAdminTier(editor, "delegate a compliance item");
  if (!assignTo) throw new Error("Pick who it's for.");
  if (!dueDate) throw new Error("Pick a due date.");
  const proofType = readProofTypeField(formData, true);

  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const { data: compliance, error: complianceError } = await supabase
    .from("compliance_reminders")
    .select("id, topic")
    .eq("id", complianceId)
    .single();
  if (complianceError || !compliance) throw new Error("That compliance item isn't there anymore.");

  const { error } = await supabase.from("tasks").insert({
    outlet_id: outletId,
    description: compliance.topic,
    assigned_to: assignTo,
    due_date: dueDate,
    status: "approved",
    approved_by: editor.id,
    approved_at: new Date().toISOString(),
    self_assigned: false,
    requires_proof: true,
    proof_type: proofType,
    source_compliance_id: complianceId,
  });
  if (error) throw new Error(error.message);
}
