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
  dueDate: string | null;
  resolutionNote: string | null;
  archived: boolean;
  requiresProof: boolean;
  proofMediaUrl: string | null; // live signed URL, regenerated per fetch — not a stored public link
  proofMediaType: string | null; // 'photo' | 'video' | 'audio' | 'doc'
  createdAt: string;
};

export type SuggestionRow = {
  patternId: string;
  summary: string;
  proposedAction: string;
  createdAt: string;
};

// Display order matching how the people were named in the request, rather
// than whatever order the DB happens to return.
const DISPLAY_ORDER = ["Aman Rawat", "Sneha Thapa", "Ritika Bisht"];

export async function getTasksPageData(): Promise<{
  people: PersonOption[];
  tasks: TaskRow[];
  suggestions: SuggestionRow[];
}> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const [{ data: users }, { data: tasksRaw }, { data: patternsRaw }] = await Promise.all([
    supabase.from("users").select("id, name, access_tier").eq("outlet_id", outletId),
    supabase
      .from("tasks")
      // A single string literal, not concatenated — postgrest-js parses
      // this at the type level to infer the Row shape, and that parsing
      // only works on a literal string type, not a runtime-built one.
      .select(
        "id, description, status, assigned_to, created_by, self_assigned, approved_by, due_date, resolution_note, archived, requires_proof, proof_media_path, proof_media_type, created_at"
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
  ]);

  const people = (users ?? []).sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.name) - DISPLAY_ORDER.indexOf(b.name)
  );
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  const tasks: TaskRow[] = await Promise.all(
    (tasksRaw ?? []).map(async (t) => {
      let proofMediaUrl: string | null = null;
      if (t.proof_media_path) {
        const { data: signed } = await supabase.storage
          .from(PROOF_BUCKET)
          .createSignedUrl(t.proof_media_path, SIGNED_URL_TTL_SECONDS);
        proofMediaUrl = signed?.signedUrl ?? null;
      }
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
        proofMediaUrl,
        proofMediaType: t.proof_media_type,
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

  return { people, tasks, suggestions };
}
