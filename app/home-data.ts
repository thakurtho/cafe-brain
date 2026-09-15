import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";
import { SUBJECT_TAGS } from "@/lib/tell-classifier";
import type { SubjectTag } from "@/lib/supabase/database.types";

const SUBJECT_LABEL: Partial<Record<SubjectTag, string>> = Object.fromEntries(
  SUBJECT_TAGS.map((s) => [s.value, s.label])
);

export type HomeFeedItem = {
  id: string;
  kind: "log" | "incident";
  summary: string;
  subjectLabel: string | null;
  createdAt: string;
};

/**
 * Home's updates feed (Schema Living Doc v4 §1, §8): every log, tagged by
 * subject, plus resolved incidents (same shelf once settled, still tagged
 * so they weight the pattern scan later). Manual archive only — never
 * automatic. Open incidents, judgment calls, and floor-handled incidents
 * don't appear here — those are the new Team screen's territory (out of
 * scope for this rebuild; see SCHEMA_NOTES.md).
 */
export async function getHomeFeedData(): Promise<HomeFeedItem[]> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const [logsResult, incidentsResult] = await Promise.all([
    supabase
      .from("logs")
      .select("id, summary, subject, created_at")
      .eq("outlet_id", outletId)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("incidents")
      .select("id, description, subject, created_at")
      .eq("outlet_id", outletId)
      .eq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (logsResult.error) throw new Error(`Could not load logs: ${logsResult.error.message}`);
  if (incidentsResult.error) throw new Error(`Could not load resolved incidents: ${incidentsResult.error.message}`);

  const logItems: HomeFeedItem[] = (logsResult.data ?? []).map((l) => ({
    id: l.id,
    kind: "log",
    summary: l.summary,
    subjectLabel: l.subject ? SUBJECT_LABEL[l.subject] ?? l.subject : null,
    createdAt: l.created_at,
  }));
  const incidentItems: HomeFeedItem[] = (incidentsResult.data ?? []).map((i) => ({
    id: i.id,
    kind: "incident",
    summary: i.description,
    subjectLabel: i.subject ? SUBJECT_LABEL[i.subject] ?? i.subject : null,
    createdAt: i.created_at,
  }));

  return [...logItems, ...incidentItems].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
