import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";

export type PersonOption = { id: string; name: string; access_tier: string };

export type TaskRow = {
  id: string;
  description: string;
  status: string;
  assignedToName: string | null;
  createdByName: string | null;
  selfAssigned: boolean;
  approvedByName: string | null;
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
      .select("id, description, status, assigned_to, created_by, self_assigned, approved_by, created_at")
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

  const tasks: TaskRow[] = (tasksRaw ?? []).map((t) => ({
    id: t.id,
    description: t.description,
    status: t.status,
    assignedToName: t.assigned_to ? nameById.get(t.assigned_to) ?? "Unknown" : null,
    createdByName: t.created_by ? nameById.get(t.created_by) ?? "Unknown" : null,
    selfAssigned: t.self_assigned,
    approvedByName: t.approved_by ? nameById.get(t.approved_by) ?? "Unknown" : null,
    createdAt: t.created_at,
  }));

  const suggestions: SuggestionRow[] = (patternsRaw ?? []).map((p) => ({
    patternId: p.id,
    summary: p.summary,
    proposedAction: p.proposed_action as string,
    createdAt: p.created_at,
  }));

  return { people, tasks, suggestions };
}
