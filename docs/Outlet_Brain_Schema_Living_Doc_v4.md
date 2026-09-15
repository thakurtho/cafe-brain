# Outlet Brain — Schema Living Doc (v4)

Supersedes all earlier versions. This is the single source of truth — screens, flowcharts, and Claude Code instructions all derive from this.

**Global rule:** every table carries `created_at`. Anything with a lifecycle carries the relevant event timestamp. Every multi-table write from one classified session happens in a single transaction.

---

## 0. The core model — content type is what drives everything

**The single most important correction from this build phase: subject (what a conversation is about) does NOT change how it flows. Content type does. Subject is a label that rides along for filtering, search, and pattern-grouping — never a fork in the logic.**

### Content types (five, decided at session close, one session can produce more than one)

| Type | Definition |
|---|---|
| `log` | Pure FYI. Never required action, at any point. Files, no review, no decision. |
| `incident` | Required someone to act — whether already resolved or still open. This is the whole test: did action get required, even in the past? |
| `judgment_call` | A discretionary decision a person already made. Always attributed. |
| `task_request` | Explicitly names something that needs doing. |
| `query` | A question (Ask). Runs the exact same post-session classification as Tell — see §3. |

### Subject taxonomy — now split into two kinds

**Entity-subjects** (a real, poolable thing with an ID):
- Customer, Vendor, Staff/Colleague, Equipment/Machine, Recipe/Menu, Inventory/Stock, Facility/Premises

**Process-subjects** (a domain tag, no discrete "thing" to attach an ID to):
- Process/SOP, Finance/Billing, Compliance/Safety, Schedule/Roster, Competitor/Market

Subject = entity + process, together the 12 categories in the Conversation Topic Taxonomy doc. Full mode/content-type mapping for all 180 sample topics: Session Classification Reference doc.

### Safety and cash — flags, not a subject and not a separate flow

`is_safety` and `is_cash_related` are boolean flags checkable on any content type, most commonly incident. In practice a genuinely safety-relevant `log` already qualifies as an `incident` by the action-required test, so the two collapse naturally. A cash-related `log` (routine till count, no discrepancy) stays a plain log; the flag only escalates behavior when paired with an actual incident (a real discrepancy).

---

## 1. LOG — destination

Every log lands in **Home's updates feed**, tagged by subject. No review, no decision, ever. Drag-to-archive is a manual, per-item action available here — never automatic (not tied to shift close, which may leave things unresolved/unread).

One side effect, not a fork: if it represents inventory loss (breakage/spoilage), it *also* creates a `wastage_entries` row that sits in **Approve/Review only** while pending — not duplicated on Home. Once approved and synced to POS, it moves to Home as the closed record — same transition pattern as incidents and patterns, never shown in both places at once.

## 2. INCIDENT — full lifecycle

Resolved-during-session vs. still-open is decided within the same Tell session (the AI's own follow-up questions — "is it fixed? who fixed it?" — happen inside that session, before classification finalizes).

| State | Destination | Notes |
|---|---|---|
| Resolved during session | **Home** (updates feed) | Same shelf as logs once settled, but stays tagged `incident` — this is what lets it correctly weight the recurrence scan, unlike a plain log |
| Unresolved, `floor_handles` | **Team screen**, entire time it's open | Redefined: `floor_handles` means a documented SOP already covers the fix, no spend/authorization needed (e.g. grinder recalibration) — not "low severity." Passively visible to manager, not gated for approval. Pure visibility, no action available |
| `floor_handles`, marked resolved | **Home** | One clean transition — moves off Team the moment it's closed, same as any other resolved incident |
| Unresolved, `mgr_must_engage` | **Approve/Review** | Needs spend, a vendor call, or judgment beyond a written procedure (e.g. AC repair, technician callout). System shows evidence + a suggested fix; manager approves/edits/replaces via **Create task from this** (§9) — never the raw symptom as the task title, always the fix ("Book AC technician visit," not "AC not cooling") |

Safety/injury always forces `mgr_must_engage`, overriding the normal floor/manager split.

## 3. JUDGMENT CALL

Always attributed (inherently personal, can't be meaningfully anonymized). Lands in **Team screen**, not Task screen — nothing operational to approve. Manager responds: "sound call" (→ playbook precedent) or "here's a better way" (→ playbook guidance, coaching-framed). Never disciplinary by default; only escalates via the same 3x-recurrence trigger as everything else (§6).

## 4. TASK REQUEST

Routes directly into the Task flow (§5) — same mechanics as a task created through the dedicated Task button.

## 5. TASK — full lifecycle

### Creation (four sources)
- **Self-added** → active immediately, **private** (not manager-visible by default)
- **Manager-created** → active immediately, manager-visible
- **Staff-suggested for someone else** → requires manager approval → THEN manager-visible and assignee-visible
- **System-generated** (from a pattern's proposed_action, or an unresolved `mgr_must_engage` incident) → requires manager approval → THEN visible

All four converge into one Active Task, `due_date` always required, `task_id` persists for the task's entire life.

### Completion — self-task lane is genuinely separate, not a variant of the shared lane
**Self-added tasks:** no proof, no spot-check, no reassignment to next shift on non-completion (there's no "someone else" to reassign to). Overdue self-tasks simply sit flagged overdue — no auto-close, no escalation, no punitive mechanism. If a self-task turns out to be genuinely blocked in a way that needs real resourcing (e.g. a missing part), it graduates out of the self-lane into a real manager-facing task at that point — it doesn't stay purely private once resourcing is needed.

**Everything else (assigned/approved tasks):**
- Done, with proof (photo/video/text/audio) → 1-in-5 round-robin spot-check → accepted (Done) or rejected (reopens, **same `task_id`**, new completion attempt linked via `reopened_from_completion_id` for history)
- Genuinely blocked → new task created FOR MANAGER (e.g. procure the part), original tagged `blocked_by_task_id` → original auto-reopens once the blocker closes
- Won't/can't right now, vague reason → reason logged plainly, no attribution for a single instance → task passes to next shift, unassigned, re-enters the active pool

### Tasks now feed the pattern-scan too
Correction from earlier: anomalous *frequency* of the same task type against the same entity is a real signal — three grinder-calibration tasks in one day (normally one) should surface even though each individual task looks fine closed out. Self-added tasks feed this aggregate even though individually private — same logic as Ask (invisible one at a time, visible once it recurs).

### Attribution inside a task's own conversation
Any drill-down/can't-complete conversation always carries the real `user_id` internally, regardless of what gets shown — same rule as every session. If new content surfaces there (a genuine complaint, e.g.), it's independently classified via §0-4, not inherited from the task's own (always-named) visibility.

---

## 6. Async Pattern & Knowledge Gap scan — separate, periodic, not per-session

Runs across the outlet's recent history (logs, incidents, judgment calls, tasks, Ask failures) — not decided within any single session.

### Pattern — grouped by entity, triggered by ANY 3+ issues, not same-symptom repetition
Correction: a vendor that's late once, sends the wrong item once, and short-ships once is exactly as much a pattern as the same problem three times — grouping is by `entity_id`, not by matching issue type. Same for a machine, a process, or a person.

- **Entity is a thing (vendor, machine, recipe, facility item, customer):** system reports the evidence plus a *suggested* action — never auto-actionable. Lands in **Approve/Review**, stays there until the manager decides. Manager can accept the suggestion, edit it, or write a completely different action — see §9 for how this stays linked regardless of what they choose. Once actioned or dismissed, moves to **Home** as an informational, closed record.
- **Entity is a person (3x recurrence):** never becomes a `pattern` record at all — generates a **review flag** instead, landing in **Team screen**, split:
  - Positive → **Recognition**
  - Concerning → **Coaching**
  - No approve/reject action either way — purely visibility for the manager to decide whether to have a conversation.

### Knowledge gap — one mechanism, two framings
- **First occurrence** (Ask found no answer) → reaches manager immediately in **Approve/Review**, framed as "this needs an answer," with the actual question(s) shown in full and occurrence count — not a one-line summary.
- **Recurrence** of the same gap → separate signal in **Team screen**, framed as "staff need a refresher / training gap" — not bundled with the original "please answer" item. Can suggest "schedule a training" as its task via the same §9 mechanism.
- Either way, once answered, it becomes new SOP/training/recipe content and feeds back into Ask's knowledge base.

---

## 9. Escalation & task linking — one unified mechanism

Applies identically to: pattern proposed-actions, `mgr_must_engage` incidents, knowledge gaps, and blocked-tasks. Solves the "manager picks a different action than suggested, link to the source is lost" problem.

**"Create task from this"** — a single action available on every one of these card types. The system always shows a suggested action as a starting point (evidence-based, never auto-executed). The manager can accept it as-is, edit it, or replace it entirely with something different. Whichever they choose, clicking **Create task from this** is what creates the task — the link back to the source is set mechanically by the act of creation, not by matching text to the original suggestion.

`tasks` gains four nullable linking fields, set automatically by this action: `source_pattern_id`, `source_incident_id`, `source_knowledge_gap_id`, `blocked_by_task_id` (blocked-task linking already existed; the other three are new).

**Escalation, applied uniformly (not pattern-specific):** any pattern or `mgr_must_engage` incident sitting unactioned past a time threshold escalates to Owner/GM automatically. Dismissal is a plain one-tap action — no reason required, no added friction — but the system logs who dismissed it and when, and that record is always visible to Owner/GM. Transparency comes from the dismissal being logged at all, not from an explanation attached to it. Same rule for both content types.

**Linking survives manual task creation too.** If a manager creates a task directly (bypassing "Create task from this"), the system checks for an open pattern on the same `entity_id` and offers a soft nudge — "This looks related to an open pattern about Machine 2 — link it?" Accepting retroactively sets `source_pattern_id`; declining leaves it unrelated. Never blocks task creation, just makes an accidental disconnect recoverable instead of silent.

**Broadcasts** — a manager-authored, one-way message. Any manager-tier role can publish one (not just Outlet Manager — matters if an outlet has multiple managers). No AI classification involved, it's authored content. Lands in the Home updates feed for **both** staff and manager views.

| Table | Purpose |
|---|---|
| `broadcasts` | id, outlet_id, author_user_id, message, audience (all/role), created_at |

---

## 7. ASK — fully collapses into Tell's pipeline

Ask = retrieval, **plus** the exact same post-session classification Tell runs. Not a special case.

- If the question or answer exchange itself narrates an operational fact ("how do I fix this, it just crashed," or "what's Shweta's usual order — also she's vegetarian now"), that fact is extracted and classified the same way a Tell would be — the whole session is scanned at close, not just a keyword match on the question, and not limited to crash-style examples.
- Every Ask session still writes a `session_classifications` row (`content_type=query`), even on a successful, unremarkable lookup.
- No answer found → employee told immediately, "ask your manager" → separately, silently logged as a `knowledge_gap`, first-occurrence framing, into Approve/Review.

---

## 8. Manager screens — full set (nothing removed, Team is the only new addition)

Employee screens (unchanged): **Home** (Ask/Tell + today's updates feed, including broadcasts), **Tasks** (own kanban), **Shift** (own start/checkout), **Profile** (own info, training).

Manager gets the same four, scoped wider, plus three more:

| Screen | Contains |
|---|---|
| **Home** | Same as staff, outlet-wide updates |
| **Tasks** | Same kanban structure — **"To approve/review" is a column inside Tasks, not a separate screen**: task approvals, pattern proposed-actions, `mgr_must_engage` incidents, knowledge gaps (first occurrence), task spot-checks |
| **Shift** | Mine/Outlet toggle |
| **Team** (new) | People signals, no decision required: judgment calls, person-recurrence (Recognition/Coaching), training-gap flags, floor-handled incidents while still open |
| **Reports** | Insights / My Reports / Org Reports |
| **Profile** | Own info **+ Admin**: org chart, add/remove users, POS sync, compliance, machines/vendors/menu |

Home's passive updates feed (visible to both roles) is also where **logs, resolved incidents, informational patterns, and manager broadcasts** all land — this is "Outlet Updates" from earlier naming, same feed, not a separate screen either.

---

## Standing entity/process reference

| Entity-subjects (real ID) | Process-subjects (domain tag) |
|---|---|
| Customer | Process/SOP |
| Vendor | Finance/Billing |
| Staff/Colleague | Compliance/Safety |
| Equipment/Machine | Schedule/Roster |
| Recipe/Menu | Competitor/Market |
| Inventory/Stock | |
| Facility/Premises | |

---

## Carried-forward interaction rules (still standing, unchanged)

- No fake completions — verifiable real-world states never get a manual "mark done."
- Compliance clears only with proof (`proof_document_url` required).
- Voice-first applies to resolution, not just capture.
- No direct writes to approved knowledge — SOPs/recipes/training always route as a suggestion to the named owner.
- Reversals are new entries, never edits to history (e.g. wastage reversal writes an offsetting POS entry).
- Assignment scoped by org structure — reportees + same-level peers only.
- A task's destination is always a real choice at creation/approval time, never assumed.
- No name-searchable query path anywhere in the manager app — no "everything about [staff name]" lookup.
- Every session carries a real `user_id` internally regardless of visibility — "anonym" only controls what's shown, never what's recorded.

---

## Build status note

This version resolves several rounds of correction on the attribution/visibility model, the incident/log boundary, task privacy, and pattern-grouping logic. Flowchart (4-panel verified version) needs a light patch to reflect: tasks feeding the pattern-scan, the self-task lane split, and resolved-incident routing to Outlet Updates. Manager screens (Approve/Review, Team, Outlet Updates) need rebuilding against §8 before the next Claude Code brief goes out.
