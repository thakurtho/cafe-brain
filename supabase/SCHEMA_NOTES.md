# Schema notes — deviations from `docs/Outlet_Brain_Schema_Living_Doc.md`

Everything below was either decided with you directly, or added because the
doc referenced it without defining it, or because the dummy data needed a
column the doc's field list didn't mention. Nothing here was guessed
silently — flagging it all here for the table-structure sanity check.

- **Ask rebuild against Schema Living Doc v4 §7** (migration `20260916120000`)
  — "Ask fully collapses into Tell's pipeline. Not a special case." Ask was
  previously stateless (no session row at all); it now gets the same
  session/messages capture layer Tell has, per your call to do the full §7
  collapse rather than just bolting on multi-turn.
  - New `classification_type` value `'query'` — v4: "Every Ask session
    still writes a session_classifications row (content_type=query), even
    on a successful, unremarkable lookup." Written once per session, at
    close, with `resulting_id`/`confidence` both null since it's a marker,
    not a pointer to a real record.
  - Two separate classification moments, matching the doc's own three
    bullets under §7:
    1. **Per-turn** (`sendAskMessage`): the model now answers via a forced
       `answer_question` tool call with an explicit `found_answer`
       boolean, instead of freeform text — needed to know precisely when a
       lookup failed, per the doc's literal "No answer found → employee
       told immediately... → separately, silently logged as a
       knowledge_gap" language, which happens right then, not deferred to
       close.
    2. **At close** (`closeAskSessionCore` in `lib/ask-session.ts`): the
       whole transcript is re-scanned with the exact same
       `finalize_tell` tool Tell itself uses (via the extracted
       `saveTellStyleClassifications` in `lib/classification-writer.ts`)
       for any operational fact the conversation surfaced — usually
       nothing, sometimes an incident/log/task/judgment_call.
  - **Session close mechanism** (your call, since the doc doesn't specify
    one — Ask has no natural end like Tell's finalize does): an explicit
    "End conversation" button, backed up by a 5-minute client-side idle
    timer, backed up AGAIN by a server-side lazy sweep
    (`sweepStaleAskSessions`) that runs on every Home page load and closes
    any of the outlet's Ask sessions idle past 5 minutes — same
    "runs opportunistically on page load, no cron infra" pattern already
    used for Tasks' auto-archive sweep. Belongs in `lib/ask-session.ts`,
    not `app/actions.ts`, specifically because every export from a
    `"use server"` file becomes a publicly callable endpoint whether the
    UI calls it or not — this logic is only ever invoked from other server
    code, never directly from the client.
  - **Knowledge-gap write timing — corrected after first QC round**:
    originally written per-turn, immediately on any failed lookup. You
    caught that this produces a separate `knowledge_gaps` row per failed
    follow-up within the SAME conversation (e.g. "how to make a cortado?"
    then "can't you at least guess?" logged as two gaps, not one) — v4's
    "first-occurrence framing" is at the session level, not the turn
    level. Fixed: `sendAskMessage` now just flags the session
    (`sessions.flagged` + `flag_reason` accumulating the distinct
    unanswered questions asked) as misses happen; the actual
    `knowledge_gaps` write happens once, in `closeAskSessionCore`, using
    the accumulated `flag_reason` as `question_text`.
  - **Knowledge-gap dedup across sessions**: at close, that write checks
    for an already-open `knowledge_gaps` row with the *exact same*
    `question_text` at this outlet (from an earlier session) and
    increments `occurrence_count` instead of duplicating. Explicitly a
    placeholder for the doc's "first occurrence vs recurrence" framing —
    recognizing the SAME gap phrased two different ways, or escalating a
    recurring one to Team as a training signal, is the deferred async
    Pattern & Knowledge-gap scan's job (v4 §6), not this exact-text check.
  - **Confirmed NOT a knowledge_gap**: a staff member stating in a *Tell*
    that they're untrained on something (e.g. grinder recalibration) does
    not write anything right now. `knowledge_gap` in v4 is specifically
    "Ask found no answer" — a hole in the system's knowledge base, not a
    fact about one person's training status. You confirmed the right home
    for that is eventually a Team-screen "coaching needed" flag, fed by
    the same deferred async scan — so no code change belongs here yet.
  - Refactored `app/actions.ts`'s Tell finalize step (the switch inserting
    into logs/incidents/judgment_calls/tasks) out into
    `lib/classification-writer.ts`, and the entity-candidate fetching out
    into `lib/entity-candidates.ts`, so Tell and Ask's close-time
    classification share one implementation instead of two copies that
    could silently drift apart (exactly the kind of duplication that
    caused the `.replace()` crash on a missing `content_type` — one fix
    now covers both).
  - `ACTING_AS_PHONE` moved out of `app/actions.ts` into a new
    `lib/acting-as.ts` — `home-data.ts` needs it too (for the idle-sweep's
    attribution), and a `"use server"` file can only export async
    functions, not plain constants (same reason `app/tasks/tiers.ts`
    exists).

- **Tell rebuild against Schema Living Doc v4** (migration `20260915120000`)
  — v4's central correction is that content type, not subject, decides
  where a Tell goes; subject just rides along for filtering. Confirmed
  scope with you before building:
  - `observations` and `fyis` merged into one `logs` table (v4 no longer
    distinguishes them). Same ids preserved across the merge so
    `patterns.observation_ids` and any existing `session_classifications`
    rows keep resolving. `tasks.source_observation_id` renamed to
    `source_log_id` and its FK repointed at `logs`.
  - `classification_type` renamed `task` → `task_request`, added `log` and
    `judgment_call`. `observation`, `fyi`, and `pattern` are left in the
    enum, just unused going forward — `pattern` specifically because v4
    moves pattern detection to a separate async/periodic scan (§6) that
    this pass doesn't build; a per-session Tell never produces one anymore.
  - New `subject_tag` enum, all 12 categories from v4's entity/process
    reference table, added as a `subject` column on `logs`, `incidents`,
    `judgment_calls`, and `tasks`.
  - Entity resolution now covers all 7 entity-subjects, not just
    machine/customer. Two of them — Inventory/Stock and Facility/Premises —
    have no basis anywhere in the schema or the 8 dummy-data docs (the SOPs
    doc only mentions "milk stock check" and "dairy stock" as checklist
    line items, never a named list). Chose (your call) to add real
    `inventory_items`/`facility_areas` tables with a small hand-written
    seed list rather than leave these two subject-tag-only — inventory
    items are grounded in what's actually named elsewhere (oat milk,
    vanilla syrup from `01_Menu_and_Recipes.md`'s recipe variants; milk,
    coffee beans, sugar, napkins, stirrers from the checklists); facility
    areas have no grounding at all and are a plain placeholder set
    (Seating Area, Counter, Storage Room, Restroom) — correct these once a
    real list exists.
  - Tell is now a real multi-turn conversation — the model can ask a
    follow-up (e.g. "is it fixed now?") before classifying, and one session
    can produce more than one content type (e.g. a resolved incident
    that's also a judgment call), both called out explicitly in v4 §0/§2.
    Follow-ups are capped at 2 per session to guarantee termination.
    Tool-use calls are translated to plain assistant text before being
    persisted to `messages` — never stored or replayed as raw `tool_use`
    blocks — same convention `sendDrillDownMessage` already used.
  - Safety/injury hard-forces `response_type = 'manager_must_engage'` in
    application code, not just via prompt wording — v4 §2 is explicit this
    always overrides the normal floor/manager split.
  - A wastage/spoilage log also opens a `wastage_entries` row (pending,
    Approve/Review only) per v4 §1 — a routine stock check is not wastage,
    only an actual loss.
  - **Prompt fix after QC**: the classifier initially tagged a broken cup
    as `equipment_machine` (and didn't flag it as wastage), since nothing
    distinguished durable equipment (espresso machine, grinder) from
    consumables/tableware. `equipment_machine` is now explicitly scoped to
    durable installed equipment only; `inventory_stock` explicitly
    includes crockery/glassware, with a worked example under the Wastage
    rule (broken cup/plate = wastage, `inventory_stock`).
  - **Deliberately not built in this pass** (flagged to you before
    starting, confirmed as out of scope): Ask's own classification
    collapse into the same pipeline (v4 §7); the async Pattern &
    Knowledge-gap scan (v4 §6, entirely new, periodic, cross-session); the
    new **Team** manager screen (judgment calls, person-recurrence flags,
    training-gap flags, open floor-handled incidents have nowhere to
    display yet — they're still written to the DB correctly, just not
    surfaced); and the unified "Create task from this" escalation/linking
    mechanism (v4 §9), including `source_knowledge_gap_id` and
    `blocked_by_task_id`.
  - A minimal **Home** updates feed was added (`app/home-feed.tsx`,
    `app/home-data.ts`) since nothing displayed logs or resolved incidents
    anywhere before this — shows both, tagged by subject, manual archive
    per log (v4 §1: "Drag-to-archive is a manual, per-item action... never
    automatic").

- **Task completion review** (migration `20260914110000`) — a task
  requiring proof no longer goes straight to Done on submission; it lands
  `completion_status = 'pending_review'` (status stays `'approved'`
  underneath) until a manager accepts or rejects it. Tasks with
  `requires_proof = false` skip this entirely and go straight to Done,
  same as before — confirmed this scoping makes sense since
  `requires_proof` was already tracked per-task, not globally, so nothing
  new was needed to gate on it.
  - **Accept** → `status = 'done'`, `completion_status = 'accepted'`. A
    compliance-delegated task's compliance-clearing logic moved here from
    `markTaskDone` — since compliance tasks always require proof, they
    always go through review now, so clearing on raw submission would
    have been wrong (it should wait for manager acceptance).
  - **Reject** → the rejected attempt is **frozen, not reset**: the
    existing row keeps its proof/notes/timestamp exactly as submitted,
    gets `archived = true` and `status = 'rejected'` (the existing
    `task_status` enum value, previously defined but never actually used
    anywhere until now), plus `rejection_reason`. A **new** task row is
    inserted carrying the same description/assignee/due
    date/proof-requirement/source-lineage, linked back via
    `reopened_from_completion_id`. That new row is what reappears in "To
    complete"; the frozen one stays visible, untouched, in Archived. If
    it's rejected again, the chain continues from whichever row it was
    most recently reopened from, not necessarily the original.

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
`sessions`, `messages`, `session_classifications`, `logs`,
`patterns`, `tasks`, `incidents`, `judgment_calls`, `knowledge_gaps`,
`wastage_entries`, `pos_permissions`, `pos_synced_tasks`,
`scheduled_shifts`, `shift_openings`, `shift_handovers`,
`checklist_completions`, `entity_links`, `report_definitions`,
`report_instances` — all migrated, none seeded. The 8 dummy-data docs don't
contain any session/task/shift-history data to seed them with; inventing
fake operational history wasn't part of the brief. (`observations`/`fyis`
were on this list too, before the Tell v4 rebuild merged them into `logs`
and dropped both tables.)

`inventory_items` and `facility_areas` are the exception added by that same
rebuild — small hand-written seed lists, see the note above, since neither
table has a real source in the original 8 docs.

## RLS scope
Every outlet-scoped table: visible/writable if it's your own `outlet_id`,
or you're `gm_owner` and it's within your `brand_id`. That's the boundary
you asked for. Fine-grained action gating (only Head Chef approves a
recipe, only Outlet Manager+ approves wastage, etc. — section 11 of the
doc) is **not** encoded as RLS yet; those are app-layer rules that depend
on flows that don't exist yet. Flagged in the RLS migration's header
comment too, not just here.
