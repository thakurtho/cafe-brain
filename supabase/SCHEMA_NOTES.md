# Schema notes — deviations from `docs/Outlet_Brain_Schema_Living_Doc.md`

Everything below was either decided with you directly, or added because the
doc referenced it without defining it, or because the dummy data needed a
column the doc's field list didn't mention. Nothing here was guessed
silently — flagging it all here for the table-structure sanity check.

## Decided with you
- **Auth**: Supabase Auth, phone OTP. `public.users.id` = `auth.users.id` (1:1).
- **Brand/outlet scoping**: `users.brand_id` (required) added to every user;
  `users.outlet_id` is nullable (null = brand-level GM/Owner). RLS lets a
  `gm_owner` see every outlet under their `brand_id`; everyone else is
  locked to their own `outlet_id`.
- **`access_tier` enum** added alongside the free-text `role` column:
  `floor_staff / shift_manager / outlet_manager / gm_owner`. `role` stays
  descriptive text (e.g. "Captain / Senior Barista"); `access_tier` is what
  RLS actually checks.
- **`scheduled_shifts`** table added (referenced by `shift_openings` /
  `shift_handovers` via `scheduled_shift_id`, but never defined in the doc).
  Includes `pos_shift_id` + `synced_at` for the planned PetPooja sync.
- **`tasks.due_date`, `tasks.resolution_note`, `tasks.archived`** added
  (migration `20260913150000`) once the Tasks feature needed them: a
  deadline, a place to record why a task couldn't be completed (or general
  completion comments), and a soft-archive flag so finished/abandoned
  tasks can be tucked away without deleting the row.
- **`task_status` enum gained `'blocked'`** (migration `20260913150100`,
  its own file — Postgres won't let a new enum value be used in the same
  transaction that adds it) — distinct from `'rejected'`, which means the
  *approval* was denied, not that someone tried and couldn't finish it.
- **Task assignment/approval rule, refined twice during building:** self-
  assigned tasks always skip approval. Originally *any* assignment to
  someone else required a separate manager approval step, even a
  manager's own assignment — later changed on request: a manager-tier
  creator's assignment is now approved immediately (they *are* the
  approval), while a non-manager assigning someone else still lands
  `pending_approval` for a manager to clear.

## Added because the dummy data needed it
- `menu_items.price` — the doc's field list omits it; every Musafir Cafe
  menu item has an INR price.
- `vendors.category` — the doc's field list omits it; the dummy data has a
  Category column per vendor.
- `training_progress` table — not in the doc at all. The dummy training
  data has a per-staff, per-module completion matrix, and the manager
  mockup has tasks that "auto-close when their training status shows
  done" — both need somewhere to live.

## Added for internal consistency / RLS
- `outlet_id` added to `observations`, `incidents`, `judgment_calls`,
  `checklist_completions`. Every sibling table in the same schema-doc
  section already carries `outlet_id`; these four just dropped it from the
  doc's field list. Needed for RLS scoping either way.
- `training_progress.outlet_id` — denormalized from the user's outlet, same
  reason.
- `knowledge_gaps.promoted_to_type` alongside the doc's `promoted_to_id` —
  it's a polymorphic pointer (SOP/recipe/training record); a bare uuid
  doesn't say which table, same pattern as `entity_type`/`entity_id`
  elsewhere in the doc.

## Interpretive calls (flagged, not blocking)
- Enums were only created for fields the doc gives explicit values for in
  parentheses (e.g. `mode (ask/tell)`). Fields that just say "status" with
  no enumerated values (`observations.status`, `pos_synced_tasks.status`)
  are plain `text` rather than a guessed enum — easy to tighten later once
  the actual states are pinned down.
- `tasks.source_insight_id` is a **soft** reference (no FK) to
  `report_instances.id` — "insight" isn't a first-class table anywhere in
  the doc; `insight_text` lives on `report_instances`, and that's the only
  sensible target for the mockups' "Create task" button on an insight card.
- `recipes.ingredients` is `jsonb`, `steps` is `text`. The dummy recipes
  read as loose bullet lists mixing quantities and technique — seeded as-is
  into `steps`; `ingredients` is left null in the seed (structuring 12
  recipes into `{name, quantity}` pairs felt like more invention than the
  brief asked for, but the column's there when you want it).
- `checklist_items` were derived by hand from the Opening/Closing Checklist
  SOP steps in `docs/05_SOPs_and_Checklists.md` (13 items) — the doc
  describes checklist_items as a table but the dummy data only gives prose
  checklists, not pre-split rows.

## Intentionally left empty by the seed script
`sessions`, `messages`, `session_classifications`, `observations`, `fyis`,
`patterns`, `tasks`, `incidents`, `judgment_calls`, `knowledge_gaps`,
`wastage_entries`, `pos_permissions`, `pos_synced_tasks`,
`scheduled_shifts`, `shift_openings`, `shift_handovers`,
`checklist_completions`, `entity_links`, `report_definitions`,
`report_instances` — all migrated, none seeded. The 8 dummy-data docs don't
contain any session/task/shift-history data to seed them with; inventing
fake operational history wasn't part of the brief.

## RLS scope
Every outlet-scoped table: visible/writable if it's your own `outlet_id`,
or you're `gm_owner` and it's within your `brand_id`. That's the boundary
you asked for. Fine-grained action gating (only Head Chef approves a
recipe, only Outlet Manager+ approves wastage, etc. — section 11 of the
doc) is **not** encoded as RLS yet; those are app-layer rules that depend
on flows that don't exist yet. Flagged in the RLS migration's header
comment too, not just here.
