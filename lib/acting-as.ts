import "server-only";

// ⚠️ TEMPORARY pre-auth stopgap #2 (see app/actions.ts's file-header
// comment for the full list) — every Tell/Ask is attributed to one
// hardcoded seeded user, Aman Rawat (Captain / Senior Barista), instead of
// whoever's actually signed in. Lives in its own module, not
// app/actions.ts, because a "use server" file may only export async
// functions — plain constants need a separate home, same reason
// app/tasks/tiers.ts exists.
export const ACTING_AS_PHONE = "+919876510002";
