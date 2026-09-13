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
- **Task assignment/approval rule, flip-flopped twice, now back to the
  original:** self-assigned tasks always skip approval — unchanged
  throughout. Assignment to someone else: v1 = always needs manager
  approval, no exception for who's assigning. v2 = a manager-tier
  creator's own assignment auto-approves (they *are* the approval). v3
  (current) = back to v1 — no special-casing by creator's role, ever.
  Each change was an explicit instruction, not a bug fix; noted here so
  the history is legible rather than silently overwritten each time.
- **`tasks.proof_type` / `tasks.proof_value`** (migration `20260913170000`)
  originally reused the `proof_type` enum already defined for
  `checklist_items` (photo/reading/voice/confirm) instead of classifying an
  uploaded file's MIME type after the fact. Superseded one migration later
  (`20260913180000`): task and checklist proof needs turned out to
  genuinely diverge — tasks don't want 'reading' (closing a task is
  already an explicit confirm action, a typed number adds nothing) and do
  want 'video' (checklist never needed it). `tasks.proof_type` now has its
  own `task_proof_type` enum (text/photo/video/audio); `checklist_items`
  keeps the original `proof_type` untouched. First case in this schema of
  un-sharing a type that looked reusable at first but wasn't.
- **`tasks.due_date` went from optional to required** (migration
  `20260913180000`, explicit instruction) — existing null rows backfilled
  to the migration date before the NOT NULL constraint was added. Every
  `tasks` insert anywhere in the app (including the Ask/Tell Tell-
  classifier's task-creation path in `app/actions.ts`, easy to miss since
  it's a different file from the Tasks feature) now must supply one;
  Ask/Tell defaults to a flat 3-days-out placeholder since the classifier
  doesn't infer a real deadline from the Tell text.
- **`tasks.completed_at`** (migration `20260913180000`) — set when a task
  is marked done; needed for auto-archive to know how long a task's been
  sitting there.
- **`outlets.auto_archive_done_after_days`** (migration `20260913180000`)
  — admin-configurable (outlet_manager/gm_owner), null = off. Swept lazily
  in `app/tasks/data.ts` on each Tasks page load rather than a real
  scheduled job, since this app has no cron/background-task
  infrastructure yet. Manual archive continues to work independently.
- **`tasks.source_compliance_id`** (migration `20260913190000`) —
  delegating a compliance reminder (`delegateComplianceTask`) creates a
  real task linked back via this column; completing that task clears the
  compliance item too (`compliance_reminders.status = 'cleared'`, with
  `proof_document_url` populated from whatever proof was provided — that
  column has a CHECK requiring it non-null before 'cleared', so it's
  always given a real value, never left to satisfy the constraint with a
  placeholder). Once delegated, the raw compliance card stops appearing in
  "To complete" — only the task tracks from there. Compliance-sourced
  tasks always have `requires_proof = true` (compliance clearing
  structurally requires proof per the original schema doc rule); the admin
  only picks which of the four proof types.
- **`tasks.extension_requested` / `requested_due_date` / `extension_reason`**
  (migration `20260913190000`) — a deadline-extension request, distinct
  from `'blocked'`: asking for more time isn't the same claim as "I can't
  do this at all," so it's its own flag rather than overloading blocked
  status. A requested task keeps its normal `'approved'` status (still
  workable, still shows in "To complete") while also surfacing in "To
  approve/review" for a manager's approve/deny decision.
- **General task reassignment ("delegation")** is a manager action
  available on any non-terminal task (`updateTaskDetails`, extended with
  `assignTo` + `description`), not a separate blocked-tasks-only feature —
  reassigning to the same or a different person after a task is blocked
  sends it back to "To complete" approved for its new holder; a manager
  actively picking an assignee is treated as the approval, same logic as
  approving a pattern suggestion.
- **Drill-down conversations use the existing capture layer, no new
  tables** (migration `20260914100000` has nothing to add here beyond a
  comment). Confirmed first that Ask and Tell were both strictly one-shot
  — Tell closes its session immediately after classifying; Ask never even
  opens one. A drill-down is just a `sessions` row that stays `'open'`
  across multiple exchanges instead, linked to whatever it's about via
  `entity_links` (`source_type = 'session'`, `entity_type`/`entity_id` =
  the pattern or task) — `entity_links` was already built for exactly this
  ("single index for everything about X") and had never been used by
  anything until now. Only wired up for patterns and tasks, the only two
  entity types with real cards anywhere in this app; observations and
  incidents don't have a list view yet, so there's nowhere to attach a
  "discuss this" button to them.
- **`broadcasts` / `broadcast_acknowledgements`** (migration
  `20260914100000`) — a one-way manager message, optionally scoped to one
  `access_tier` (null = everyone). Targeting by `access_tier` rather than
  the free-text `role` column for the same reason `report_definitions
  .recipient_role` does — it's the one structured, reliable grouping
  already used for permission checks elsewhere. Acknowledgement tracking
  only meaningfully applies to `important` broadcasts, but isn't
  restricted to those at the schema level.
- **`shift_swap_requests`**, **`shift_swap_status` enum** (migration
  `20260914100000`) — `shift_date`/`start_time`/`end_time` are captured
  directly on the request (denormalized) rather than requiring a link to a
  real `scheduled_shifts` row, since nothing in this app has ever created
  one (`scheduled_shifts` exists in the schema, unused — see below).
  `scheduled_shift_id` is an optional FK for whenever real shift-scheduling
  UI exists. A volunteer (`volunteer_id`) is tracked independently of
  `status` — a request can be pending with or without one, and a manager
  can approve either way.
- **Notifications aren't a table.** `app/notifications/data.ts` is a thin
  aggregator over the other three features' own data (tasks, patterns,
  compliance, swaps, broadcasts) — no persisted read/unread state, no
  separate source of truth to keep in sync. Two of its triggers
  (`knowledge_gaps` open, `shift_openings.discrepancy_flagged`) are queried
  defensively even though nothing in this app currently writes to either
  table — no knowledge-gap escalation flow and no shift-handover UI exist
  yet, so both always come back empty today. Kept so the notification
  logic is already correct the moment either flow gets built, rather than
  another thing to remember to wire up later.
- **`tasks.source_pattern_id` / `tasks.source_incident_id`** (migration
  `20260913170000`) — lineage used to derive task priority (a
  pattern-sourced or safety-incident-sourced task ranks above a plain
  task) rather than a manually-set priority field. `source_pattern_id` is
  wired up (set when a suggestion is approved into a task);
  `source_incident_id` is schema-only for now — nothing in this app
  currently converts an incident into a task, so that priority tier never
  fires yet, but the column is there for when it does.
- **Compliance-card visibility gated to `outlet_manager`/`gm_owner`**
  specifically, not the broader `shift_manager`-and-up set used for task
  approval — matches the schema doc's screen-access table, where Shift
  Manager gets Approve/Review but not Outlet Admin. First place in the
  app that needed two distinct manager-ish tiers rather than one.

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
