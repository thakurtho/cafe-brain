// Plain shared constants — deliberately NOT in actions.ts: a "use server"
// file may only export async functions, so a client component importing a
// plain value from there fails the build.

// Can approve tasks / suggestions (schema doc's Approve/Review screen).
export const APPROVER_TIERS = new Set(["shift_manager", "outlet_manager", "gm_owner"]);

// Compliance is Outlet Admin territory in the schema doc's screen-access
// table — Shift Manager gets Approve/Review but NOT Outlet Admin, so this
// is deliberately a stricter set than APPROVER_TIERS, not the same one.
export const ADMIN_TIERS = new Set(["outlet_manager", "gm_owner"]);
