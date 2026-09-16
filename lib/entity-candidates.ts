import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SUBJECT_TAGS, ENTITY_TYPE_BY_SUBJECT, type TellClassificationItem } from "@/lib/tell-classifier";
import type { SubjectTag } from "@/lib/supabase/database.types";

export type EntityCandidates = Partial<Record<SubjectTag, { id: string; name: string }[]>>;

// Fetch every entity-subject's candidate names in one go, so the model
// always has the full list to resolve entity_name against (v4 §0's 7
// entity-subjects). Shared by Tell (classifying a fresh report) and Ask's
// session-close review, since both need the same entity resolution.
export async function fetchEntityCandidates(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: string
): Promise<EntityCandidates> {
  const [machines, customers, vendors, users, menuItems, inventoryItems, facilityAreas] = await Promise.all([
    supabase.from("machines").select("id, name").eq("outlet_id", outletId),
    supabase.from("customers").select("id, name").eq("outlet_id", outletId),
    supabase.from("vendors").select("id, name").eq("outlet_id", outletId),
    supabase.from("users").select("id, name").eq("outlet_id", outletId),
    supabase.from("menu_items").select("id, name").eq("outlet_id", outletId),
    supabase.from("inventory_items").select("id, name").eq("outlet_id", outletId),
    supabase.from("facility_areas").select("id, name").eq("outlet_id", outletId),
  ]);

  return {
    equipment_machine: machines.data ?? [],
    customer: customers.data ?? [],
    vendor: vendors.data ?? [],
    staff_colleague: users.data ?? [],
    recipe_menu: menuItems.data ?? [],
    inventory_stock: inventoryItems.data ?? [],
    facility_premises: facilityAreas.data ?? [],
  };
}

export function buildEntityContextText(bySubject: EntityCandidates): string {
  return SUBJECT_TAGS.filter((s) => s.kind === "entity")
    .map((s) => `Known ${s.label} names: ${(bySubject[s.value] ?? []).map((r) => r.name).join(", ") || "(none)"}`)
    .join("\n");
}

export function resolveEntity(
  item: TellClassificationItem,
  bySubject: EntityCandidates
): { entityType: string | null; entityId: string | null } {
  const subject = item.subject ?? null;
  if (!subject || !item.entity_name) return { entityType: null, entityId: null };
  const candidates = bySubject[subject];
  const match = candidates?.find((c) => c.name === item.entity_name);
  if (!match) return { entityType: null, entityId: null };
  return { entityType: ENTITY_TYPE_BY_SUBJECT[subject] ?? null, entityId: match.id };
}
