# Outlet Brain — Schema Living Doc

Working reference. Update this as the build evolves — this is the source of truth for what each table does and who owns its content.

**Global rule:** every table carries `created_at`. Anything with a lifecycle also carries the relevant event timestamp (`resolved_at`, `approved_at`, `completed_at`, `synced_at`). Every multi-table write from one classified session happens in a single transaction — all rows commit together, or none do, with retry until it succeeds.

---

## Setup model

Every brand-level table is seeded with a default at brand setup. Outlets inherit that default. Whether an outlet can diverge from it — and whether that divergence needs sign-off — depends on the table. Three columns below capture this per table: **default owner** (who sets the brand-wide starting point), **can outlet edit** (yes / with approval / no), **who approves an outlet edit**.

---

## 1. Identity & org structure

| Table | Purpose | Default owner | Can outlet edit | Approver |
|---|---|---|---|---|
| `brands` | The parent company | — | — | — |
| `outlets` | One row per location, linked to `brand_id` | Brand | — | — |
| `users` | id, name, phone, email, role, language_preference, outlet_id | — | Outlet | Outlet Manager |
| `org_positions` | id, outlet_id, role_title, reports_to_position_id, filled_by, level | Brand (standard role set) | Yes, freely | — |

**Outlet Admin screen** (Outlet Manager and above only — Shift Manager / Floor Supervisor do not get this):
- Org chart editor (`org_positions`) — add/remove positions, mark vacancies
- User management (`users`) — add/remove staff, assign roles
- POS sync status + error log
- Compliance record setup (`compliance_reminders`)
- Machines, vendors — add/edit
- Menu items — add/edit (Outlet Manager, Head Chef, Bar Manager for drinks; Shift Manager and Floor Supervisor cannot)
- Base recipes — visible here, editable only by Head Chef

## 2. Reference entities

| Table | Purpose | Default owner | Can outlet edit | Approver |
|---|---|---|---|---|
| `menu_items` | id, outlet_id, name, category | Brand (core menu) | With approval (regional additions) | Outlet Manager |
| `machines` | id, outlet_id, name, type, installed_on | — | Outlet, freely | — |
| `customers` | id, outlet_id, name, phone, preferences | — | Outlet, freely | — |
| `vendors` | id, outlet_id, name, supplies | — | Outlet, freely | — |

**Customer tagging — deferred, flagged as needing a fuller build than the rest of Phase 1.** Placeholder mechanism: at session close, fuzzy-match a mentioned name against this outlet's `customers`. High-confidence match tags automatically; low-confidence prompts a clarifying question rather than guessing; no match leaves it untagged rather than creating a bad record. Full design (deduping, merge logic, confidence thresholds) revisited in a later phase per the phased plan.

## 3. Approved knowledge

| Table | Purpose | Default owner | Can outlet edit | Approver |
|---|---|---|---|---|
| `recipes` (base) | id, menu_item_id, outlet_id, ingredients, steps, owner_id, version, status, approved_by, approved_at | Brand Head Chef | No — outlet cannot touch base recipe | Brand Head Chef only |
| `recipe_variants` | id, base_recipe_id, outlet_id, description, submitted_by, source_session_id, status, approved_by, approved_at, is_standing_option | — | Outlet, freely (proposal) | Outlet's Head Chef |
| `sops` | id, outlet_id, topic, linked_machine_id, content, owner_id, pending_edit_content, edit_source, version, status, approved_by, approved_at | Brand template | With approval | SOP owner (named person) |
| `training_modules` | id, outlet_id, title, content, linked_menu_item_id, linked_machine_id, owner_id, pending_edit_content, edit_source, version, status, approved_by, approved_at | Brand (standard curriculum) | With approval (local layer) | Module owner |
| `checklist_items` | id, outlet_id, title, linked_sop_id, proof_type, required, category (opening/closing/general) | Brand template | With approval | Outlet Manager |

## 4. Capture layer

| Table | Purpose | Notes |
|---|---|---|
| `sessions` | id, outlet_id, user_id, initiated_by (BIC/UIC), mode (ask/tell), status, started_at, closed_at, flagged, flag_reason | The single entry point for everything |
| `messages` | id, session_id, sender, text, media_url, created_at | |
| `session_classifications` | id, session_id, classified_as (observation/fyi/task/pattern/incident/none), resulting_id, confidence | |

## 5. Derived records

| Table | Purpose | Notes |
|---|---|---|
| `observations` | id, source_session_id, entity_type, entity_id, summary, status, created_at | |
| `fyis` | id, source_session_id, outlet_id, summary, created_at | |
| `patterns` | id, outlet_id, entity_type, entity_id, observation_ids, summary, proposed_action, status, approved_by, approved_at, brand_visible | `brand_visible` set true once approved — makes it a candidate for cross-outlet comparison at the Brand/GM layer |
| `tasks` | id, outlet_id, source_session_id, source_observation_id, source_insight_id, description, status, assigned_to, created_by, self_assigned, approved_by, approved_at, handover_reason, handover_session_id, requires_proof, completion_mode (manual/auto), auto_close_entity_type, auto_close_entity_id | Self-assigned tasks skip approval. UI always labels a task "Self-added" or "Assigned by [name]" — never unlabeled. `auto` completion tasks (e.g. a training nudge) have no manual done button — only re-nudge — and close themselves when the linked entity's real state changes |
| `incidents` | id, source_session_id, entity_type, entity_id, is_safety, severity, description, status, resolved_by, resolved_at, resolution_voice_session_id, resolution_note, handover_reason, handover_session_id, response_type, requires_immediate_call | `response_type`: `floor_handles` (staffer can close it themselves, with proof) or `manager_must_engage` (requires manager to resolve; `requires_immediate_call` pushes an immediate notification rather than sitting in a queue). Resolution supports voice, same as capture |
| `judgment_calls` | id, session_id, user_id, situation, action_taken, interview_session_id, interview_qa, promoted_to_pattern_id, flagged_to_manager, manager_notified_at | Approved/reviewed at Shift/Outlet Manager level. Only becomes visible to Brand/GM once it's part of a cross-outlet pattern |
| `knowledge_gaps` | id, source_session_id, outlet_id, question_text, entity_type, entity_id, occurrence_count, escalation_level (outlet_manager / domain_owner / brand), escalated_to, status (open/escalated/resolved), resolution_text, promoted_to_id, resolved_by, resolved_at, created_at | An unanswered Ask isn't a dead end — it becomes this. Escalates until someone can answer; resolution gets written back into the relevant SOP/recipe/training record so future Asks get a real answer, not another gap |

## 6. Wastage & POS boundary

| Table | Purpose | Notes |
|---|---|---|
| `wastage_entries` | id, source_session_id, outlet_id, item, quantity, reason, photo_url, status (pending_approval/approved/rejected), approved_by, synced_to_pos_at, reversed, reversal_reason, reversed_by, reversed_at, reversal_pos_entry_id, created_at | Floor staff logs; manager sign-off before POS write. Reversal writes a new offsetting entry — original never edited |
| `pos_permissions` | id, outlet_id, action_type, mode (direct/requires_manager_approval) | Configured per outlet's real POS access level |
| `pos_synced_tasks` | id, outlet_id, pos_task_id, description, assigned_to, synced_at, status | POS-originated tasks pulled into our Tasks screen |

## 7. Shift lifecycle

| Table | Purpose | Notes |
|---|---|---|
| `shift_openings` | id, outlet_id, scheduled_shift_id, user_id, incoming_handover_id, carried_items_reviewed, discrepancy_flagged, discrepancy_note, checklist_completions, started_at | Opening checklist + acceptance of prior handover |
| `shift_handovers` | id, outlet_id, scheduled_shift_id, source_session_ids, unresolved_incident_ids, compiled_summary, gaps_flagged, signed_off_by, signed_off_at | |
| `checklist_completions` | id, checklist_item_id, shift_handover_id or shift_opening_id, completed_by, proof_media_url, proof_value, voice_session_id, verified, created_at | Proof-based, not a bare checkbox |

## 8. Compliance

| Table | Purpose | Default owner | Can outlet edit |
|---|---|---|---|
| `compliance_reminders` | id, outlet_id, topic, due_date, process_duration_days, reminder_date, proof_document_url, status, cleared_by | Outlet | Fully outlet-specific |

Status can't clear without `proof_document_url` uploaded. `reminder_date` is computed from `due_date − process_duration_days`, not set arbitrarily.

## 11. Interaction rules (locked from prototype review — apply at build time)

- **No fake completions.** Any task tied to a verifiable real-world state (training done, incident resolved, compliance cleared) auto-closes only when that underlying state actually changes. The UI never offers a manual "mark done" for these — only a re-nudge / re-check action.
- **Compliance clears only with proof.** `proof_document_url` required before status can move to cleared. Reminder timing is computed from `process_duration_days`, not a flat arbitrary date.
- **Voice-first applies to resolution too**, not just capture. Incident and discrepancy resolution supports `voice_session_id` the same way opening/closing checklist proof does.
- **No direct writes to approved knowledge, ever.** SOPs, recipes, and training modules are always a suggestion routed to the named owner for sign-off — including brand-new SOPs created from a resolved knowledge gap. No "save" action skips this, even when suggester and owner are the same person.
- **Reversals are new entries, not edits to history.** Undoing an approved/synced action (e.g. wastage already synced to POS) writes a reversal record referencing the original — the original is never mutated or deleted. Same shape applies anywhere else a synced action needs to be reversible.
- **Assignment is scoped by org structure.** Any assignee picker (task assignment, routing an insight's actionable, transferring a knowledge gap) only shows reportees and same-level peers per `org_positions.reports_to_position_id` — never an open list of everyone.
- **A task's destination must be a real choice, not an assumption.** Creating a task from an insight, pattern, or gap always prompts who it's for — never auto-assigns to whoever triggered the creation.

## 12. Connective tissue

| Table | Purpose |
|---|---|
| `entity_links` | id, source_type, source_id, entity_type, entity_id — single index for "everything about X" |

## 13. Reporting (management only)

| Table | Purpose |
|---|---|
| `report_definitions` | id, outlet_id, name, entity_type, metric, filter, group_by, time_window, recipient_role |
| `report_instances` | id, report_definition_id, period_start, period_end, data_body, insight_text, actionable_text, source_ids |

**What a report actually is:** never a summarized conversation. It's a scheduled aggregation query (`report_definitions`) run against already-structured tables (`wastage_entries`, `incidents`, `patterns`, etc.), producing a real `data_body` (an actual table of numbers), with `insight_text` as a plain-language read of that table and `actionable_text` following from the insight. The only natural-language step is describing numbers already computed — not interpreting raw chat history.

---

## Screen access by role

| Screen | Floor staff | Shift Manager / Floor Supervisor | Outlet Manager (= Head Chef level) | GM / Owner |
|---|---|---|---|---|
| Home (Ask/Tell) | Yes | Yes | Yes | Yes |
| Tasks | Own only | Own + team | Own + team | Own + team |
| Shift (calendar, start, checkout) | Yes | Yes | Yes | Yes |
| Profile | Yes | Yes | Yes | Yes |
| Approve/Review | No | Yes (outlet-scoped; resolves `manager_must_engage` incidents, reviews judgment calls, approves tasks/wastage) | Yes (outlet-scoped; approves patterns' proposed SOP/training/checklist changes; recipe variants visible read-only unless also Head Chef) | Cross-outlet — parks matching patterns from multiple outlets as brand-wide suggestions |
| Outlet Updates | No | Yes (outlet-scoped) | Yes | Cross-outlet |
| Outlet Admin | No | No | Yes | Yes |
| Reports | No | View standard reports | Build + view | Build + view, cross-outlet |
| Shift calendar (cross-outlet) | No | No | No | Yes, read-only |

Note: floor-level `incidents` with `response_type = floor_handles` (e.g. a broken glass, swept up, no injury) are closed by the reporting staffer directly, with proof — they never reach Approve/Review unless they recur. Only `manager_must_engage` incidents require this tier to resolve.

---

*Last updated against conversation as of the shift-handover, POS-boundary, and brand-default discussion.*
