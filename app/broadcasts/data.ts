import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";

export type PersonOption = { id: string; name: string; access_tier: string };

export type BroadcastRow = {
  id: string;
  message: string;
  senderName: string | null;
  targetAccessTier: string | null;
  important: boolean;
  createdAt: string;
  ackedUserIds: string[];
};

export async function getBroadcastsPageData(): Promise<{ people: PersonOption[]; broadcasts: BroadcastRow[] }> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const [usersResult, broadcastsResult] = await Promise.all([
    supabase.from("users").select("id, name, access_tier").eq("outlet_id", outletId),
    supabase
      .from("broadcasts")
      .select("id, message, sender_id, target_access_tier, important, created_at")
      .eq("outlet_id", outletId)
      .order("created_at", { ascending: false }),
  ]);

  // See app/tasks/data.ts for why this check matters: supabase-js resolves
  // with { data: null, error } rather than throwing, so a real query
  // failure (e.g. a migration not yet run) would otherwise silently turn
  // into an empty list with no error shown anywhere.
  if (usersResult.error) throw new Error(`Could not load users: ${usersResult.error.message}`);
  if (broadcastsResult.error) throw new Error(`Could not load broadcasts: ${broadcastsResult.error.message}`);

  const users = usersResult.data;
  const broadcastsRaw = broadcastsResult.data;
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const broadcastIds = (broadcastsRaw ?? []).map((b) => b.id);

  const acksResult = broadcastIds.length
    ? await supabase.from("broadcast_acknowledgements").select("broadcast_id, user_id").in("broadcast_id", broadcastIds)
    : { data: [] as { broadcast_id: string; user_id: string }[], error: null };
  if (acksResult.error) throw new Error(`Could not load broadcast acknowledgements: ${acksResult.error.message}`);
  const acksRaw = acksResult.data;

  const ackedByBroadcast = new Map<string, string[]>();
  for (const a of acksRaw ?? []) {
    const list = ackedByBroadcast.get(a.broadcast_id) ?? [];
    list.push(a.user_id);
    ackedByBroadcast.set(a.broadcast_id, list);
  }

  const broadcasts: BroadcastRow[] = (broadcastsRaw ?? []).map((b) => ({
    id: b.id,
    message: b.message,
    senderName: b.sender_id ? nameById.get(b.sender_id) ?? "Unknown" : null,
    targetAccessTier: b.target_access_tier,
    important: b.important,
    createdAt: b.created_at,
    ackedUserIds: ackedByBroadcast.get(b.id) ?? [],
  }));

  return { people: users ?? [], broadcasts };
}
