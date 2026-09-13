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

  const [{ data: users }, { data: broadcastsRaw }] = await Promise.all([
    supabase.from("users").select("id, name, access_tier").eq("outlet_id", outletId),
    supabase
      .from("broadcasts")
      .select("id, message, sender_id, target_access_tier, important, created_at")
      .eq("outlet_id", outletId)
      .order("created_at", { ascending: false }),
  ]);

  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const broadcastIds = (broadcastsRaw ?? []).map((b) => b.id);

  const { data: acksRaw } = broadcastIds.length
    ? await supabase.from("broadcast_acknowledgements").select("broadcast_id, user_id").in("broadcast_id", broadcastIds)
    : { data: [] as { broadcast_id: string; user_id: string }[] };

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
