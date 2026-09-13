import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMusafirOutletId } from "@/lib/outlet";

export type PersonOption = { id: string; name: string; access_tier: string };

export type SwapRequestRow = {
  id: string;
  requestedById: string;
  requestedByName: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  volunteerId: string | null;
  volunteerName: string | null;
  status: string;
  approvedByName: string | null;
  createdAt: string;
};

export async function getShiftsPageData(): Promise<{ people: PersonOption[]; requests: SwapRequestRow[] }> {
  const supabase = createAdminClient();
  const outletId = await getMusafirOutletId();

  const [{ data: users }, { data: requestsRaw }] = await Promise.all([
    supabase.from("users").select("id, name, access_tier").eq("outlet_id", outletId),
    supabase
      .from("shift_swap_requests")
      .select("id, requested_by, shift_date, start_time, end_time, reason, volunteer_id, status, approved_by, created_at")
      .eq("outlet_id", outletId)
      .order("created_at", { ascending: false }),
  ]);

  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  const requests: SwapRequestRow[] = (requestsRaw ?? []).map((r) => ({
    id: r.id,
    requestedById: r.requested_by,
    requestedByName: nameById.get(r.requested_by) ?? "Unknown",
    shiftDate: r.shift_date,
    startTime: r.start_time,
    endTime: r.end_time,
    reason: r.reason,
    volunteerId: r.volunteer_id,
    volunteerName: r.volunteer_id ? nameById.get(r.volunteer_id) ?? "Unknown" : null,
    status: r.status,
    approvedByName: r.approved_by ? nameById.get(r.approved_by) ?? "Unknown" : null,
    createdAt: r.created_at,
  }));

  return { people: users ?? [], requests };
}
