import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId, getUserIdByPhone } from "@/lib/outlet";
import { SUBJECT_TAGS } from "@/lib/tell-classifier";
import { sweepStaleAskSessions } from "@/lib/ask-session";
import { ACTING_AS_PHONE } from "@/lib/acting-as";
import { getBroadcastsPageData } from "./broadcasts/data";
import type { SubjectTag } from "@/lib/supabase/database.types";

const SUBJECT_LABEL: Partial<Record<SubjectTag, string>> = Object.fromEntries(
  SUBJECT_TAGS.map((s) => [s.value, s.label])
);

export type HomeFeedItem = {
  id: string;
  kind: "log" | "incident" | "broadcast";
  summary: string;
  subjectLabel: string | null;
  isCashRelated: boolean;
  senderName: string | null; // broadcasts only
  createdAt: string;
};

/**
 * Home's updates feed (Schema Living Doc v4 §1, §8, §9): every log, tagged
 * by subject, resolved incidents (same shelf once settled, still tagged so
 * they weight the pattern scan later), and manager broadcasts ("Lands in
 * the Home updates feed for both staff and manager views" — previously
 * only had their own /broadcasts page). Manual archive only for logs —
 * never automatic. Open incidents, judgment calls, and floor-handled
 * incidents don't appear here — those are the Team screen's territory
 * (still out of scope; see SCHEMA_NOTES.md).
 *
 * Broadcasts aren't filtered by target_access_tier here — this page has
 * no "acting as" viewer concept the way Tasks/Notifications do, so there's
 * no real identity to filter against yet. Shown unfiltered, consistent
 * with everything else on this page being outlet-wide rather than
 * per-viewer right now.
 */
export async function getHomeFeedData(): Promise<HomeFeedItem[]> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  // Idle-timeout backstop for Ask conversations nobody explicitly ended
  // (v4 §7) — lazy, runs opportunistically on page load, same pattern as
  // Tasks' auto-archive sweep, since this app has no cron infrastructure.
  const userId = await getUserIdByPhone(ACTING_AS_PHONE);
  await sweepStaleAskSessions(outletId, userId);

  const [logsResult, incidentsResult, { broadcasts }] = await Promise.all([
    supabase
      .from("logs")
      .select("id, summary, subject, is_cash_related, created_at")
      .eq("outlet_id", outletId)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("incidents")
      .select("id, description, subject, is_cash_related, created_at")
      .eq("outlet_id", outletId)
      .eq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(50),
    getBroadcastsPageData(),
  ]);
  if (logsResult.error) throw new Error(`Could not load logs: ${logsResult.error.message}`);
  if (incidentsResult.error) throw new Error(`Could not load resolved incidents: ${incidentsResult.error.message}`);

  const logItems: HomeFeedItem[] = (logsResult.data ?? []).map((l) => ({
    id: l.id,
    kind: "log",
    summary: l.summary,
    subjectLabel: l.subject ? SUBJECT_LABEL[l.subject] ?? l.subject : null,
    isCashRelated: l.is_cash_related,
    senderName: null,
    createdAt: l.created_at,
  }));
  const incidentItems: HomeFeedItem[] = (incidentsResult.data ?? []).map((i) => ({
    id: i.id,
    kind: "incident",
    summary: i.description,
    subjectLabel: i.subject ? SUBJECT_LABEL[i.subject] ?? i.subject : null,
    isCashRelated: i.is_cash_related,
    senderName: null,
    createdAt: i.created_at,
  }));
  const broadcastItems: HomeFeedItem[] = broadcasts.slice(0, 50).map((b) => ({
    id: b.id,
    kind: "broadcast",
    summary: b.message,
    subjectLabel: null,
    isCashRelated: false,
    senderName: b.senderName,
    createdAt: b.createdAt,
  }));

  return [...logItems, ...incidentItems, ...broadcastItems].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
