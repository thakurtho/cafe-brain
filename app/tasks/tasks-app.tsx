"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTask,
  approveTask,
  updateTaskDetails,
  markTaskDone,
  acceptTaskCompletion,
  rejectTaskCompletion,
  markTaskBlocked,
  requestDeadlineExtension,
  approveDeadlineExtension,
  denyDeadlineExtension,
  archiveTask,
  updateAutoArchiveSetting,
  approvePatternAsTask,
  delegateComplianceTask,
} from "./actions";
import { APPROVER_TIERS, ADMIN_TIERS } from "./tiers";
import { MicButton } from "../mic-button";
import { DrillDownThread } from "../drill-down-thread";
import { Nav } from "../nav";
import type { PersonOption, TaskRow, SuggestionRow, ComplianceCardRow } from "./data";

// ⚠️ TEMPORARY (pre-auth stopgap — see app/tasks/actions.ts). This toggle
// exists only because there's no login yet; remove once real per-user
// sessions exist and derive the current user from the session instead.
const ACTING_AS_STORAGE_KEY = "outlet-brain-acting-as";

const PROOF_TYPE_LABELS: Record<string, string> = {
  text: "Text note",
  photo: "Photo",
  video: "Video",
  audio: "Audio (voice note)",
};

export function TasksApp({
  people,
  tasks,
  suggestions,
  complianceCards,
  autoArchiveDays,
}: {
  people: PersonOption[];
  tasks: TaskRow[];
  suggestions: SuggestionRow[];
  complianceCards: ComplianceCardRow[];
  autoArchiveDays: number | null;
}) {
  const [actingAsId, setActingAsId] = useState(people[0]?.id ?? "");

  useEffect(() => {
    const stored = localStorage.getItem(ACTING_AS_STORAGE_KEY);
    if (stored && people.some((p) => p.id === stored)) setActingAsId(stored);
  }, [people]);

  function changeActingAs(id: string) {
    setActingAsId(id);
    localStorage.setItem(ACTING_AS_STORAGE_KEY, id);
  }

  const actingAs = people.find((p) => p.id === actingAsId) ?? null;
  const isManager = !!actingAs && APPROVER_TIERS.has(actingAs.access_tier);
  const isAdmin = !!actingAs && ADMIN_TIERS.has(actingAs.access_tier);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 1000 }}>
      <Nav current="tasks" />
      <h1>Outlet Brain — Tasks test harness</h1>

      <section style={{ marginBottom: "1.5rem" }}>
        <b>Acting as: </b>
        {people.map((p) => (
          <button
            key={p.id}
            onClick={() => changeActingAs(p.id)}
            disabled={p.id === actingAsId}
            style={{ marginRight: 6, fontWeight: p.id === actingAsId ? "bold" : "normal" }}
          >
            {p.name.split(" ")[0]}
            {APPROVER_TIERS.has(p.access_tier) ? " (Manager)" : ""}
          </button>
        ))}
      </section>

      {isAdmin && <AutoArchiveSetting actingAsId={actingAsId} currentDays={autoArchiveDays} />}

      <AddTaskForm people={people} actingAsId={actingAsId} />

      <hr style={{ margin: "2rem 0" }} />
      <KanbanBoard
        tasks={tasks}
        suggestions={suggestions}
        complianceCards={complianceCards}
        people={people}
        actingAsId={actingAsId}
        isManager={isManager}
        isAdmin={isAdmin}
      />
    </main>
  );
}

function AutoArchiveSetting({ actingAsId, currentDays }: { actingAsId: string; currentDays: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(currentDays != null ? String(currentDays) : "");

  return (
    <section style={{ marginBottom: "1.5rem", fontSize: "0.9em", color: "#555" }}>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            try {
              await updateAutoArchiveSetting(formData);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <input type="hidden" name="actingAsUserId" value={actingAsId} />
        Auto-archive Done tasks after{" "}
        <input
          type="number"
          name="autoArchiveDays"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="off"
          style={{ width: 60 }}
        />{" "}
        days (blank = off, manual archive still works either way){" "}
        <button type="submit" disabled={pending}>
          Save
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}

function AddTaskForm({ people, actingAsId }: { people: PersonOption[]; actingAsId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [requiresProof, setRequiresProof] = useState(false);
  const [proofType, setProofType] = useState("photo");
  const [assignTo, setAssignTo] = useState(actingAsId);

  // Keep the "who's it for" default pointing at "myself" as the acting-as
  // person changes, rather than silently keeping a stale selection.
  useEffect(() => setAssignTo(actingAsId), [actingAsId]);

  return (
    <section>
      <h2>Add a task</h2>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            try {
              await createTask(formData);
              setDescription("");
              setDueDate("");
              setRequiresProof(false);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <input type="hidden" name="actingAsUserId" value={actingAsId} />
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <textarea
            name="description"
            rows={2}
            style={{ width: "100%" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Reorder oat milk before Friday"
          />
          <MicButton value={description} onChange={setDescription} />
        </div>
        <div style={{ marginTop: 4 }}>
          <label>
            Who&apos;s it for:{" "}
            <select name="assignTo" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === actingAsId ? "Myself" : p.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ marginLeft: 12 }}>
            Due (required):{" "}
            <input
              type="date"
              name="dueDate"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label style={{ marginLeft: 12 }}>
            <input
              type="checkbox"
              name="requiresProof"
              checked={requiresProof}
              onChange={(e) => setRequiresProof(e.target.checked)}
            />{" "}
            Requires proof
          </label>
          {requiresProof && (
            <label style={{ marginLeft: 12 }}>
              Proof type:{" "}
              <select name="proofType" value={proofType} onChange={(e) => setProofType(e.target.value)}>
                {Object.entries(PROOF_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button type="submit" disabled={pending || !dueDate} style={{ marginTop: 8 }}>
          {pending ? "Adding…" : "Add task"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}

type BoardCard =
  | { kind: "task"; priorityScore: number; task: TaskRow }
  | { kind: "compliance"; priorityScore: number; compliance: ComplianceCardRow };

function KanbanBoard({
  tasks,
  suggestions,
  complianceCards,
  people,
  actingAsId,
  isManager,
  isAdmin,
}: {
  tasks: TaskRow[];
  suggestions: SuggestionRow[];
  complianceCards: ComplianceCardRow[];
  people: PersonOption[];
  actingAsId: string;
  isManager: boolean;
  isAdmin: boolean;
}) {
  // Staff only see their own tasks. Managers can see the whole team,
  // filterable down to "mine" or one specific person (schema doc: "Tasks —
  // Own only" for floor staff, "Own + team" for shift manager and up).
  // This applies uniformly — self-added tasks are ordinary tasks and show
  // up in "Team" the same as any other, no separate reminder-vs-task split.
  const [filter, setFilter] = useState("all");

  const scoped = isManager
    ? tasks.filter((t) => filter === "all" || (filter === "mine" ? t.assignedTo === actingAsId : t.assignedTo === filter))
    : tasks.filter((t) => t.assignedTo === actingAsId);

  // A task needing a manager decision — pending approval, flagged blocked,
  // or an in-flight extension request — surfaces here regardless of its
  // primary status. An extension-requested task also still appears in "To
  // complete" (its holder can keep working it while waiting on a decision).
  // A task with completion_status='pending_review' is still technically
  // status='approved' underneath, but it's no longer actionable in "To
  // complete" — the assignee already submitted their attempt and is
  // waiting on a manager's decision, so it moves to "To approve/review"
  // instead, alongside the other things needing a manager's call.
  const toApprove = scoped.filter(
    (t) => t.status === "pending_approval" || t.status === "blocked" || t.extensionRequested || t.completionStatus === "pending_review"
  );
  const toCompleteTasks = scoped.filter((t) => t.status === "approved" && t.completionStatus !== "pending_review");
  const done = scoped.filter((t) => t.status === "done" && !t.archived);
  const archived = scoped.filter((t) => t.archived);

  const toCompleteCards: BoardCard[] = [
    ...toCompleteTasks.map((task): BoardCard => ({ kind: "task", priorityScore: task.priorityScore, task })),
    ...(isAdmin
      ? complianceCards.map((compliance): BoardCard => ({ kind: "compliance", priorityScore: compliance.priorityScore, compliance }))
      : []),
  ].sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <section>
      {isManager && (
        <p>
          <label>
            Show:{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Team (everyone)</option>
              <option value="mine">Mine</option>
              {/* "Mine" already covers the acting-as person — listing them
                  again here would just be a second way to see the same
                  thing. */}
              {people
                .filter((p) => p.id !== actingAsId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}&apos;s tasks
                  </option>
                ))}
            </select>
          </label>
        </p>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Column title="To approve / review" count={toApprove.length + (isManager ? suggestions.length : 0)}>
          {isManager &&
            suggestions.map((s) => (
              <SuggestionCard key={s.patternId} suggestion={s} people={people} actingAsId={actingAsId} />
            ))}
          {toApprove.map((t) => (
            <TaskCard key={t.id} task={t} people={people} actingAsId={actingAsId} isManager={isManager} />
          ))}
          {toApprove.length === 0 && !(isManager && suggestions.length > 0) && <Empty />}
        </Column>

        <Column title="To complete" count={toCompleteCards.length}>
          {toCompleteCards.map((card) =>
            card.kind === "task" ? (
              <TaskCard key={card.task.id} task={card.task} people={people} actingAsId={actingAsId} isManager={isManager} showPriority />
            ) : (
              <ComplianceCard
                key={card.compliance.id}
                compliance={card.compliance}
                people={people}
                actingAsId={actingAsId}
                isAdmin={isAdmin}
              />
            )
          )}
          {toCompleteCards.length === 0 && <Empty />}
        </Column>

        <Column title="Done" count={done.length}>
          {done.map((t) => (
            <TaskCard key={t.id} task={t} people={people} actingAsId={actingAsId} isManager={isManager} />
          ))}
          {done.length === 0 && <Empty />}
        </Column>

        <Column title="Archived" count={archived.length} muted>
          {archived.map((t) => (
            <TaskCard key={t.id} task={t} people={people} actingAsId={actingAsId} isManager={isManager} />
          ))}
          {archived.length === 0 && <Empty />}
        </Column>
      </div>
    </section>
  );
}

function Column({ title, count, muted, children }: { title: string; count: number; muted?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ flex: "1 1 220px", minWidth: 220, opacity: muted ? 0.7 : 1 }}>
      <h3 style={{ borderBottom: "1px solid #ccc", paddingBottom: 4 }}>
        {title} <span style={{ color: "#888", fontWeight: "normal" }}>({count})</span>
      </h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p style={{ color: "#888", fontSize: "0.9em" }}>Nothing here.</p>;
}

function taskTagLabel(t: TaskRow): string {
  if (t.selfAssigned) return "Self-added";
  if (t.createdByName) return `Assigned by ${t.createdByName}`;
  return "System-assigned";
}

function SuggestionCard({
  suggestion: s,
  people,
  actingAsId,
}: {
  suggestion: SuggestionRow;
  people: PersonOption[];
  actingAsId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [requiresProof, setRequiresProof] = useState(false);
  const [proofType, setProofType] = useState("photo");

  return (
    <div style={cardStyle}>
      <span style={badgeStyle("#EFE3F5", "#6B3FA0")}>Suggested (pattern)</span>
      <p style={{ margin: "6px 0 0" }}>
        <b>Pattern:</b> {s.summary}
      </p>
      <p style={{ margin: "4px 0" }}>
        <b>Proposed action:</b> {s.proposedAction}
      </p>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            try {
              await approvePatternAsTask(formData);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <input type="hidden" name="patternId" value={s.patternId} />
        <input type="hidden" name="actingAsUserId" value={actingAsId} />
        <div>
          <select name="assignTo" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="" disabled>
              Assign to…
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>{" "}
          <input type="date" name="dueDate" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div style={{ marginTop: 4 }}>
          <label>
            <input type="checkbox" name="requiresProof" checked={requiresProof} onChange={(e) => setRequiresProof(e.target.checked)} />{" "}
            Requires proof
          </label>
          {requiresProof && (
            <select name="proofType" value={proofType} onChange={(e) => setProofType(e.target.value)} style={{ marginLeft: 8 }}>
              {Object.entries(PROOF_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>
        <button type="submit" disabled={pending || !assignTo || !dueDate} style={{ marginTop: 6 }}>
          {pending ? "Approving…" : "Approve as task"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <DrillDownThread entityType="pattern" entityId={s.patternId} actingAsId={actingAsId} />
    </div>
  );
}

function ComplianceCard({
  compliance: c,
  people,
  actingAsId,
  isAdmin,
}: {
  compliance: ComplianceCardRow;
  people: PersonOption[];
  actingAsId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [dueDate, setDueDate] = useState(c.dueDate);
  const [proofType, setProofType] = useState("photo");

  return (
    <div style={cardStyle}>
      <span style={badgeStyle("#F5DAD7", "#A83B32")}>Compliance</span>
      <p style={{ margin: "6px 0 0" }}>{c.topic}</p>
      <p style={{ margin: "4px 0", fontSize: "0.9em", color: "#555" }}>
        Due {c.dueDate} · <b>{c.priorityLabel}</b>
      </p>
      {isAdmin ? (
        <form
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                await delegateComplianceTask(formData);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            });
          }}
        >
          <input type="hidden" name="complianceId" value={c.id} />
          <input type="hidden" name="actingAsUserId" value={actingAsId} />
          <select name="assignTo" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="" disabled>
              Delegate to…
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>{" "}
          <input type="date" name="dueDate" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />{" "}
          <select name="proofType" value={proofType} onChange={(e) => setProofType(e.target.value)}>
            {Object.entries(PROOF_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 4 }}>
            <button type="submit" disabled={pending || !assignTo || !dueDate}>
              {pending ? "Delegating…" : "Delegate — becomes a closeable task"}
            </button>
          </div>
        </form>
      ) : (
        <p style={{ fontSize: "0.85em", color: "#888" }}>Only an outlet manager can delegate this.</p>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}

type ConversationStage = "idle" | "asking" | "blocked-reason" | "nudge" | "requesting-extension" | "reviewing-reject";

function TaskCard({
  task: t,
  people,
  actingAsId,
  isManager,
  showPriority,
}: {
  task: TaskRow;
  people: PersonOption[];
  actingAsId: string;
  isManager: boolean;
  showPriority?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ConversationStage>("idle");
  const [blockedReason, setBlockedReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [hasFile, setHasFile] = useState(false);
  const [textProof, setTextProof] = useState("");
  const [editing, setEditing] = useState(false);
  const [requestedDate, setRequestedDate] = useState("");
  const [extensionReason, setExtensionReason] = useState("");

  function run(formData: FormData, action: (fd: FormData) => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const needsFile = t.requiresProof && (t.proofType === "photo" || t.proofType === "video" || t.proofType === "audio");
  const needsText = t.requiresProof && t.proofType === "text";
  const markDoneDisabled = pending || (needsFile && !hasFile) || (needsText && !textProof.trim());
  const canEdit = isManager && (t.status === "pending_approval" || t.status === "approved" || t.status === "blocked");

  return (
    <div style={cardStyle}>
      <p style={{ margin: 0, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.description}</p>
      <p style={{ margin: "4px 0", fontSize: "0.9em", color: "#555" }}>
        {taskTagLabel(t)}
        {t.assignedToName ? ` · for ${t.assignedToName}` : ""} · <b>{t.status}</b>
        {t.approvedByName ? ` (approved by ${t.approvedByName})` : ""} · due {t.dueDate}
      </p>
      {showPriority && <p style={{ margin: "0 0 4px", fontSize: "0.85em", color: "#888" }}>Priority: {t.priorityLabel}</p>}
      {t.resolutionNote && (
        <p style={{ margin: "4px 0", fontSize: "0.9em", fontStyle: "italic", color: "#555" }}>&ldquo;{t.resolutionNote}&rdquo;</p>
      )}
      {t.proofValue && (
        <p style={{ margin: "4px 0", fontSize: "0.9em" }}>
          <b>Note:</b> {t.proofValue}
        </p>
      )}
      {t.proofMediaUrl && <ProofPreview url={t.proofMediaUrl} type={t.proofType} />}
      {t.previousRejectionReason && (
        <p style={{ margin: "4px 0", fontSize: "0.85em", color: "#a33" }}>
          Reopened after rejection — previous attempt: &ldquo;{t.previousRejectionReason}&rdquo;. Full history in Archived.
        </p>
      )}

      {t.completionStatus === "pending_review" && (
        <div style={{ background: "#FBF0DC", padding: 6, margin: "6px 0", fontSize: "0.9em" }}>
          <p style={{ margin: 0 }}>
            <b>Completed — pending review</b>
          </p>
          {isManager ? (
            stage === "reviewing-reject" ? (
              <form
                action={(fd) => {
                  fd.set("taskId", t.id);
                  fd.set("actingAsUserId", actingAsId);
                  fd.set("reason", rejectReason);
                  run(fd, rejectTaskCompletion);
                }}
              >
                <p style={{ margin: "4px 0" }}>What needs fixing?</p>
                <div style={{ display: "flex", gap: 6 }}>
                  <textarea
                    rows={2}
                    style={{ width: "100%" }}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Explain what's wrong with this attempt…"
                  />
                  <MicButton value={rejectReason} onChange={setRejectReason} />
                </div>
                <button type="submit" disabled={pending || !rejectReason.trim()}>
                  Confirm rejection
                </button>{" "}
                <button type="button" onClick={() => setStage("idle")} disabled={pending}>
                  Back
                </button>
              </form>
            ) : (
              <div>
                <form
                  action={(fd) => {
                    fd.set("taskId", t.id);
                    fd.set("actingAsUserId", actingAsId);
                    run(fd, acceptTaskCompletion);
                  }}
                  style={{ display: "inline" }}
                >
                  <button type="submit" disabled={pending}>
                    Accept
                  </button>
                </form>{" "}
                <button type="button" onClick={() => setStage("reviewing-reject")} disabled={pending}>
                  Reject
                </button>
              </div>
            )
          ) : (
            <span style={{ color: "#888" }}>Awaiting manager review.</span>
          )}
        </div>
      )}

      {t.extensionRequested && (
        <div style={{ background: "#FBF0DC", padding: 6, margin: "6px 0", fontSize: "0.9em" }}>
          <p style={{ margin: 0 }}>
            Requesting extension to <b>{t.requestedDueDate}</b>: &ldquo;{t.extensionReason}&rdquo;
          </p>
          {isManager && (
            <form
              action={(fd) => {
                fd.set("taskId", t.id);
                fd.set("actingAsUserId", actingAsId);
                run(fd, approveDeadlineExtension);
              }}
              style={{ display: "inline" }}
            >
              <button type="submit" disabled={pending}>
                Approve extension
              </button>
            </form>
          )}{" "}
          {isManager && (
            <form
              action={(fd) => {
                fd.set("taskId", t.id);
                fd.set("actingAsUserId", actingAsId);
                run(fd, denyDeadlineExtension);
              }}
              style={{ display: "inline" }}
            >
              <button type="submit" disabled={pending}>
                Deny
              </button>
            </form>
          )}
        </div>
      )}

      {canEdit && !editing && (
        <p>
          <button onClick={() => setEditing(true)} style={{ fontSize: "0.85em" }}>
            Edit / reassign
          </button>
        </p>
      )}
      {canEdit && editing && (
        <TaskEditForm task={t} people={people} actingAsId={actingAsId} onDone={() => setEditing(false)} />
      )}

      {t.status === "pending_approval" &&
        (isManager ? (
          <form
            action={(fd) => {
              fd.set("taskId", t.id);
              fd.set("actingAsUserId", actingAsId);
              run(fd, approveTask);
            }}
          >
            <button type="submit" disabled={pending}>
              Approve
            </button>
          </form>
        ) : (
          <span style={{ color: "#888", fontSize: "0.9em" }}>Needs a manager to approve.</span>
        ))}

      {t.status === "blocked" &&
        (isManager ? (
          <form
            action={(fd) => {
              fd.set("taskId", t.id);
              run(fd, archiveTask);
            }}
          >
            <button type="submit" disabled={pending}>
              Archive (dismiss without reassigning)
            </button>
          </form>
        ) : (
          <span style={{ color: "#888", fontSize: "0.9em" }}>Flagged to a manager.</span>
        ))}

      {t.status === "approved" && t.completionStatus !== "pending_review" && stage === "idle" && (
        <div>
          <form
            action={(fd) => {
              fd.set("taskId", t.id);
              fd.set("actingAsUserId", actingAsId);
              run(fd, markTaskDone);
            }}
          >
            {t.requiresProof && (
              <p style={{ margin: "4px 0", color: "#a33", fontSize: "0.85em" }}>
                Requires proof: {PROOF_TYPE_LABELS[t.proofType ?? ""] ?? t.proofType}
              </p>
            )}
            {needsFile && (
              <input
                type="file"
                name="proofFile"
                accept={t.proofType === "photo" ? "image/*" : t.proofType === "video" ? "video/*" : "audio/*"}
                onChange={(e) => setHasFile(!!e.target.files?.length)}
                required
              />
            )}
            {needsText && (
              <div style={{ display: "flex", gap: 6 }}>
                <textarea
                  name="proofValue"
                  rows={2}
                  style={{ width: "100%" }}
                  value={textProof}
                  onChange={(e) => setTextProof(e.target.value)}
                  placeholder="What was discussed/done?"
                />
                <MicButton value={textProof} onChange={setTextProof} />
              </div>
            )}
            <br />
            <button type="submit" disabled={markDoneDisabled} style={{ marginTop: 4 }}>
              Mark done
            </button>{" "}
            <button type="button" onClick={() => setStage("asking")} disabled={pending}>
              Can&apos;t complete it
            </button>
          </form>
        </div>
      )}

      {t.status === "approved" && stage === "asking" && (
        <div>
          <p style={{ margin: "4px 0" }}>Why not?</p>
          <button onClick={() => setStage("blocked-reason")}>Genuinely blocked</button>{" "}
          <button onClick={() => setStage("nudge")}>I could still finish it</button>
        </div>
      )}

      {t.status === "approved" && stage === "blocked-reason" && (
        <form
          action={(fd) => {
            fd.set("taskId", t.id);
            fd.set("note", blockedReason);
            run(fd, markTaskBlocked);
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <textarea
              rows={2}
              style={{ width: "100%" }}
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              placeholder="What's blocking it?"
            />
            <MicButton value={blockedReason} onChange={setBlockedReason} />
          </div>
          <button type="submit" disabled={pending || !blockedReason.trim()}>
            Confirm — flag to manager
          </button>{" "}
          <button type="button" onClick={() => setStage("asking")} disabled={pending}>
            Back
          </button>
        </form>
      )}

      {t.status === "approved" && stage === "nudge" && (
        <div>
          <p style={{ margin: "4px 0", fontStyle: "italic" }}>
            Give it another shot — often these come together faster than expected. Mark done when you&apos;re finished.
          </p>
          <button onClick={() => setStage("idle")}>Back to task</button>{" "}
          <button onClick={() => setStage("requesting-extension")}>I still can&apos;t — ask for more time</button>
        </div>
      )}

      {t.status === "approved" && stage === "requesting-extension" && !t.extensionRequested && (
        <form
          action={(fd) => {
            fd.set("taskId", t.id);
            fd.set("requestedDueDate", requestedDate);
            fd.set("reason", extensionReason);
            run(fd, requestDeadlineExtension);
            setStage("idle");
          }}
        >
          <label>
            New due date:{" "}
            <input type="date" required value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <textarea
              rows={2}
              style={{ width: "100%" }}
              value={extensionReason}
              onChange={(e) => setExtensionReason(e.target.value)}
              placeholder="Why do you need more time?"
            />
            <MicButton value={extensionReason} onChange={setExtensionReason} />
          </div>
          <button type="submit" disabled={pending || !requestedDate || !extensionReason.trim()} style={{ marginTop: 4 }}>
            Send request to manager
          </button>{" "}
          <button type="button" onClick={() => setStage("nudge")} disabled={pending}>
            Back
          </button>
        </form>
      )}

      {t.status === "done" && !t.archived && (
        <form
          action={(fd) => {
            fd.set("taskId", t.id);
            run(fd, archiveTask);
          }}
        >
          <button type="submit" disabled={pending}>
            Archive
          </button>
        </form>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <DrillDownThread entityType="task" entityId={t.id} actingAsId={actingAsId} />
    </div>
  );
}

// Manager control over any non-terminal task: due date, proof, description
// (scope), and who it's assigned to — one form, since delegating to
// someone else and just tweaking a setting are the same underlying action.
// Reassigning (to the same or a different person) after a task is blocked
// sends it back to "To complete" as approved for its new holder.
function TaskEditForm({
  task: t,
  people,
  actingAsId,
  onDone,
}: {
  task: TaskRow;
  people: PersonOption[];
  actingAsId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState(t.description);
  const [assignTo, setAssignTo] = useState(t.assignedTo ?? "");
  const [dueDate, setDueDate] = useState(t.dueDate);
  const [requiresProof, setRequiresProof] = useState(t.requiresProof);
  const [proofType, setProofType] = useState(t.proofType ?? "photo");

  return (
    <form
      style={{ background: "#f7f7f7", padding: 8, marginBottom: 8 }}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await updateTaskDetails(formData);
            onDone();
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        });
      }}
    >
      <input type="hidden" name="taskId" value={t.id} />
      <input type="hidden" name="actingAsUserId" value={actingAsId} />
      <div style={{ display: "flex", gap: 6 }}>
        <textarea name="description" rows={2} style={{ width: "100%" }} value={description} onChange={(e) => setDescription(e.target.value)} />
        <MicButton value={description} onChange={setDescription} />
      </div>
      <div style={{ marginTop: 4 }}>
        <label>
          Assign to:{" "}
          <select name="assignTo" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginLeft: 8 }}>
          Due: <input type="date" name="dueDate" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <div style={{ marginTop: 4 }}>
        <label>
          <input type="checkbox" name="requiresProof" checked={requiresProof} onChange={(e) => setRequiresProof(e.target.checked)} />{" "}
          Requires proof
        </label>
        {requiresProof && (
          <select name="proofType" value={proofType} onChange={(e) => setProofType(e.target.value)} style={{ marginLeft: 8 }}>
            {Object.entries(PROOF_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div style={{ marginTop: 6 }}>
        <button type="submit" disabled={pending || !dueDate || !description.trim() || !assignTo}>
          Save
        </button>{" "}
        <button type="button" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </form>
  );
}

// url is a freshly-generated signed URL (see app/tasks/data.ts) — the
// task-proofs bucket is private, so this only works because it's created
// server-side on every page load, not a permanent public link.
function ProofPreview({ url, type }: { url: string; type: string | null }) {
  if (type === "photo") {
    // eslint-disable-next-line @next/next/no-img-element -- signed URL, not something next/image's optimizer should cache
    return <img src={url} alt="Proof of completion" style={{ maxWidth: "100%", maxHeight: 200, display: "block", marginTop: 4 }} />;
  }
  if (type === "video") {
    return <video src={url} controls style={{ maxWidth: "100%", maxHeight: 200, display: "block", marginTop: 4 }} />;
  }
  if (type === "audio") {
    return <audio src={url} controls style={{ display: "block", marginTop: 4 }} />;
  }
  return null;
}

const cardStyle: React.CSSProperties = { border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.5rem" };

function badgeStyle(bg: string, fg: string): React.CSSProperties {
  return { fontSize: "0.75em", padding: "2px 8px", borderRadius: 10, background: bg, color: fg };
}
