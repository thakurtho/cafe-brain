import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";

const PROOF_BUCKET = "task-proofs";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — regenerated on every page load, so this just needs to outlast one view

export type PersonOption = { id: string; name: string; access_tier: string };

export type TaskRow = {
  id: string;
  description: string;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  selfAssigned: boolean;
  approvedByName: string | null;
  dueDate: string;
  resolutionNote: string | null;
  archived: boolean;
  requiresProof: boolean;
  proofType: string | null; // 'text' | 'photo' | 'video' | 'audio'
  proofValue: string | null;
  proofMediaUrl: string | null; // live signed URL, regenerated per fetch — not a stored public link
  sourcePatternId: string | null;
  sourceIncidentId: string | null;
  sourceComplianceId: string | null;
  extensionRequested: boolean;
  requestedDueDate: string | null;
  extensionReason: string | null;
  completionStatus: string | null; // 'pending_review' | 'accepted' | 'rejected' — null if it never required review
  completionReviewedByName: string | null;
  rejectionReason: string | null;
  previousRejectionReason: string | null; // from the attempt this was reopened from, if any
  priorityScore: number;
  priorityLabel: string;
  createdAt: string;
};

export type SuggestionRow = {
  patternId: string;
  summary: string;
  proposedAction: string;
  createdAt: string;
};

export type ComplianceCardRow = {
  id: string;
  topic: string;
  dueDate: string;
  daysUntilDue: number;
  priorityScore: number;
  priorityLabel: string;
};

// Display order matching how the people were named in the request, rather
// than whatever order the DB happens to return.
const DISPLAY_ORDER = ["Aman Rawat", "Sneha Thapa", "Ritika Bisht"];

function taskPriority(t: {
  source_incident_id: string | null;
  source_pattern_id: string | null;
  source_compliance_id: string | null;
}): { score: number; label: string } {
  // source_incident_id isn't wired up by any UI yet (see the migration's
  // comment) — kept here so the ranking is correct the moment something
  // does set it.
  if (t.source_compliance_id) return { score: 95, label: "High (compliance deadline)" };
  if (t.source_incident_id) return { score: 90, label: "High (from a safety incident)" };
  if (t.source_pattern_id) return { score: 60, label: "Medium (recurring pattern)" };
  return { score: 20, label: "Normal" };
}

function compliancePriority(daysUntilDue: number): { score: number; label: string } {
  if (daysUntilDue < 0) return { score: 100, label: `High (overdue by ${-daysUntilDue}d)` };
  if (daysUntilDue <= 7) return { score: 80, label: `High (due in ${daysUntilDue}d)` };
  return { score: 40, label: `Medium (due in ${daysUntilDue}d)` };
}

export async function getTasksPageData(): Promise<{
  people: PersonOption[];
  tasks: TaskRow[];
  suggestions: SuggestionRow[];
  complianceCards: ComplianceCardRow[];
  autoArchiveDays: number | null;
}> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const { data: outlet, error: outletError } = await supabase
    .from("outlets")
    .select("auto_archive_done_after_days")
    .eq("id", outletId)
    .single();
  if (outletError) throw new Error(`Could not load outlet settings: ${outletError.message}`);
  const autoArchiveDays = outlet?.auto_archive_done_after_days ?? null;

  // Auto-archive sweep — lazy, runs on page load rather than a real
  // scheduled job (this app has no cron/background-task infrastructure).
  // Manual archiving (archiveTask) still works independently of this.
  if (autoArchiveDays) {
    const cutoff = new Date(Date.now() - autoArchiveDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("tasks")
      .update({ archived: true })
      .eq("outlet_id", outletId)
      .eq("status", "done")
      .eq("archived", false)
      .lte("completed_at", cutoff);
  }

  const [usersResult, tasksResult, patternsResult, complianceResult] = await Promise.all([
    supabase.from("users").select("id, name, access_tier").eq("outlet_id", outletId),
    supabase
      .from("tasks")
      .select(
        "id, description, status, assigned_to, created_by, self_assigned, approved_by, due_date, resolution_note, archived, requires_proof, proof_type, proof_value, proof_media_path, source_pattern_id, source_incident_id, source_compliance_id, extension_requested, requested_due_date, extension_reason, completion_status, completion_reviewed_by, rejection_reason, reopened_from_completion_id, completed_at, created_at"
      )
      .eq("outlet_id", outletId)
      .order("created_at", { ascending: false }),
    supabase
      .from("patterns")
      .select("id, summary, proposed_action, created_at")
      .eq("outlet_id", outletId)
      .eq("status", "pending")
      .not("proposed_action", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("compliance_reminders")
      .select("id, topic, due_date, reminder_date")
      .eq("outlet_id", outletId)
      .neq("status", "cleared")
      .lte("reminder_date", new Date().toISOString().slice(0, 10)),
  ]);

  // Supabase-js does NOT throw on a query error — it resolves with
  // { data: null, error }. Destructuring only `data` (as this file used
  // to) silently turns a real failure (e.g. a column from a migration
  // that hasn't been run yet) into an empty array, with the Tasks board
  // just quietly showing nothing and no error anywhere. Surface it.
  if (usersResult.error) throw new Error(`Could not load users: ${usersResult.error.message}`);
  if (tasksResult.error) throw new Error(`Could not load tasks: ${tasksResult.error.message}`);
  if (patternsResult.error) throw new Error(`Could not load patterns: ${patternsResult.error.message}`);
  if (complianceResult.error) throw new Error(`Could not load compliance reminders: ${complianceResult.error.message}`);

  const users = usersResult.data;
  const tasksRaw = tasksResult.data;
  const patternsRaw = patternsResult.data;
  const complianceRaw = complianceResult.data;

  const people = (users ?? []).sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.name) - DISPLAY_ORDER.indexOf(b.name)
  );
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  // The frozen (archived) rejected attempt a reopened task points back to
  // is itself in this same fetched set — no extra query needed to look up
  // its rejection_reason for display on the new attempt.
  const rejectionReasonByTaskId = new Map((tasksRaw ?? []).map((t) => [t.id, t.rejection_reason]));

  const tasks: TaskRow[] = await Promise.all(
    (tasksRaw ?? []).map(async (t) => {
      let proofMediaUrl: string | null = null;
      if (t.proof_media_path) {
        const { data: signed } = await supabase.storage
          .from(PROOF_BUCKET)
          .createSignedUrl(t.proof_media_path, SIGNED_URL_TTL_SECONDS);
        proofMediaUrl = signed?.signedUrl ?? null;
      }
      const priority = taskPriority(t);
      return {
        id: t.id,
        description: t.description,
        status: t.status,
        assignedTo: t.assigned_to,
        assignedToName: t.assigned_to ? nameById.get(t.assigned_to) ?? "Unknown" : null,
        createdBy: t.created_by,
        createdByName: t.created_by ? nameById.get(t.created_by) ?? "Unknown" : null,
        selfAssigned: t.self_assigned,
        approvedByName: t.approved_by ? nameById.get(t.approved_by) ?? "Unknown" : null,
        dueDate: t.due_date,
        resolutionNote: t.resolution_note,
        archived: t.archived,
        requiresProof: t.requires_proof,
        proofType: t.proof_type,
        proofValue: t.proof_value,
        proofMediaUrl,
        sourcePatternId: t.source_pattern_id,
        sourceIncidentId: t.source_incident_id,
        sourceComplianceId: t.source_compliance_id,
        extensionRequested: t.extension_requested,
        requestedDueDate: t.requested_due_date,
        extensionReason: t.extension_reason,
        completionStatus: t.completion_status,
        completionReviewedByName: t.completion_reviewed_by ? nameById.get(t.completion_reviewed_by) ?? "Unknown" : null,
        rejectionReason: t.rejection_reason,
        previousRejectionReason: t.reopened_from_completion_id
          ? rejectionReasonByTaskId.get(t.reopened_from_completion_id) ?? null
          : null,
        priorityScore: priority.score,
        priorityLabel: priority.label,
        createdAt: t.created_at,
      };
    })
  );

  const suggestions: SuggestionRow[] = (patternsRaw ?? []).map((p) => ({
    patternId: p.id,
    summary: p.summary,
    proposedAction: p.proposed_action as string,
    createdAt: p.created_at,
  }));

  // Don't show a compliance card once it's been delegated into a task —
  // the task's own lifecycle (and its link back via source_compliance_id)
  // is the thing to track from here, not a second, redundant raw card.
  const delegatedComplianceIds = new Set(
    (tasksRaw ?? []).map((t) => t.source_compliance_id).filter((id): id is string => !!id)
  );

  const today = new Date();
  const complianceCards: ComplianceCardRow[] = (complianceRaw ?? [])
    .filter((c) => !delegatedComplianceIds.has(c.id))
    .map((c) => {
      const daysUntilDue = Math.round((new Date(c.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const priority = compliancePriority(daysUntilDue);
      return {
        id: c.id,
        topic: c.topic,
        dueDate: c.due_date,
        daysUntilDue,
        priorityScore: priority.score,
        priorityLabel: priority.label,
      };
    });

  return { people, tasks, suggestions, complianceCards, autoArchiveDays };
}
