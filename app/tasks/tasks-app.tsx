"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTask,
  approveTask,
  markTaskDone,
  markTaskBlocked,
  archiveTask,
  approvePatternAsTask,
} from "./actions";
import type { PersonOption, TaskRow, SuggestionRow } from "./data";

// ⚠️ TEMPORARY (pre-auth stopgap — see app/tasks/actions.ts). This toggle
// exists only because there's no login yet; remove once real per-user
// sessions exist and derive the current user from the session instead.
const APPROVER_TIERS = new Set(["shift_manager", "outlet_manager", "gm_owner"]);
const ACTING_AS_STORAGE_KEY = "outlet-brain-acting-as";

export function TasksApp({
  people,
  tasks,
  suggestions,
}: {
  people: PersonOption[];
  tasks: TaskRow[];
  suggestions: SuggestionRow[];
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

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 680 }}>
      <p>
        <a href="/">← Ask / Tell</a>
      </p>
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

      <AddTaskForm people={people} actingAsId={actingAsId} />

      {isManager && (
        <>
          <hr style={{ margin: "2rem 0" }} />
          <SuggestionsList people={people} suggestions={suggestions} actingAsId={actingAsId} />
        </>
      )}

      <hr style={{ margin: "2rem 0" }} />
      <TaskList tasks={tasks} people={people} actingAsId={actingAsId} isManager={isManager} />
    </main>
  );
}

function AddTaskForm({ people, actingAsId }: { people: PersonOption[]; actingAsId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [requiresProof, setRequiresProof] = useState(false);
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
        <textarea
          name="description"
          rows={2}
          style={{ width: "100%" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Reorder oat milk before Friday"
        />
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
            Due:{" "}
            <input type="date" name="dueDate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label style={{ marginLeft: 12 }}>
            <input
              type="checkbox"
              name="requiresProof"
              checked={requiresProof}
              onChange={(e) => setRequiresProof(e.target.checked)}
            />{" "}
            Requires proof of completion
          </label>
        </div>
        <button type="submit" disabled={pending} style={{ marginTop: 8 }}>
          {pending ? "Adding…" : "Add task"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}

function SuggestionsList({
  people,
  suggestions,
  actingAsId,
}: {
  people: PersonOption[];
  suggestions: SuggestionRow[];
  actingAsId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  return (
    <section>
      <h2>Suggested tasks (from patterns)</h2>
      <p style={{ fontSize: "0.85em", color: "#888" }}>Manager-only — floor staff don&apos;t see this section.</p>
      {suggestions.length === 0 && <p style={{ color: "#888" }}>None right now.</p>}
      {suggestions.map((s) => (
        <div key={s.patternId} style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.5rem" }}>
          <p style={{ margin: 0 }}>
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
            <label>
              Assign to:{" "}
              <select
                name="assignTo"
                value={assignments[s.patternId] ?? ""}
                onChange={(e) => setAssignments((a) => ({ ...a, [s.patternId]: e.target.value }))}
              >
                <option value="" disabled>
                  Choose someone…
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>{" "}
            <button type="submit" disabled={pending || !assignments[s.patternId]}>
              {pending ? "Approving…" : "Approve as task"}
            </button>
          </form>
        </div>
      ))}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}

function TaskList({
  tasks,
  people,
  actingAsId,
  isManager,
}: {
  tasks: TaskRow[];
  people: PersonOption[];
  actingAsId: string;
  isManager: boolean;
}) {
  // Managers can look at everyone's tasks, filterable by team member.
  // Non-managers only ever see their own — matches the schema doc's
  // screen-access table ("Tasks: Own only" for floor staff, "Own + team"
  // for shift manager and up).
  const [filter, setFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const scoped = isManager
    ? tasks.filter((t) => filter === "all" || (filter === "mine" ? t.assignedTo === actingAsId : t.assignedTo === filter))
    : tasks.filter((t) => t.assignedTo === actingAsId);

  const active = scoped.filter((t) => !t.archived);
  const archived = scoped.filter((t) => t.archived);

  return (
    <section>
      <h2>Tasks</h2>
      {isManager && (
        <p>
          <label>
            Show:{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All tasks</option>
              <option value="mine">Mine</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}&apos;s tasks
                </option>
              ))}
            </select>
          </label>
        </p>
      )}

      {active.length === 0 && <p style={{ color: "#888" }}>No tasks here.</p>}
      {active.map((t) => (
        <TaskItem key={t.id} task={t} actingAsId={actingAsId} isManager={isManager} />
      ))}

      {archived.length > 0 && (
        <>
          <p>
            <button onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Hide" : "Show"} archived ({archived.length})
            </button>
          </p>
          {showArchived &&
            archived.map((t) => (
              <div key={t.id} style={{ border: "1px solid #eee", padding: "0.75rem", marginBottom: "0.5rem", opacity: 0.6 }}>
                <p style={{ margin: 0, textDecoration: "line-through" }}>{t.description}</p>
                <p style={{ margin: "4px 0", fontSize: "0.9em", color: "#888" }}>
                  {taskTagLabel(t)} · for {t.assignedToName} · <b>{t.status}</b>
                  {t.resolutionNote ? ` — "${t.resolutionNote}"` : ""}
                </p>
              </div>
            ))}
        </>
      )}
    </section>
  );
}

function taskTagLabel(t: TaskRow): string {
  if (t.selfAssigned) return "Self-added";
  if (t.createdByName) return `Assigned by ${t.createdByName}`;
  return "System-assigned";
}

function TaskItem({
  task: t,
  actingAsId,
  isManager,
}: {
  task: TaskRow;
  actingAsId: string;
  isManager: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showBlockedForm, setShowBlockedForm] = useState(false);
  const [note, setNote] = useState("");
  const [hasFile, setHasFile] = useState(false);

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

  return (
    <div style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.5rem" }}>
      <p style={{ margin: 0, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.description}</p>
      <p style={{ margin: "4px 0", fontSize: "0.9em", color: "#555" }}>
        {taskTagLabel(t)}
        {t.assignedToName ? ` · for ${t.assignedToName}` : ""} · <b>{t.status}</b>
        {t.approvedByName ? ` (approved by ${t.approvedByName})` : ""}
        {t.dueDate ? ` · due ${t.dueDate}` : ""}
      </p>
      {t.resolutionNote && (
        <p style={{ margin: "4px 0", fontSize: "0.9em", fontStyle: "italic", color: "#555" }}>
          &ldquo;{t.resolutionNote}&rdquo;
        </p>
      )}
      {t.proofMediaUrl && <ProofPreview url={t.proofMediaUrl} type={t.proofMediaType} />}

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

      {t.status === "approved" && !showBlockedForm && (
        <div>
          {t.requiresProof && (
            <p style={{ margin: "0 0 4px", fontSize: "0.85em", color: "#a33" }}>
              Proof of completion required — attach a photo, video, audio, or document below.
            </p>
          )}
          <form
            action={(fd) => {
              fd.set("taskId", t.id);
              run(fd, markTaskDone);
            }}
          >
            <input
              type="file"
              name="proofFile"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
              onChange={(e) => setHasFile(!!e.target.files?.length)}
              required={t.requiresProof}
            />
            <br />
            <button type="submit" disabled={pending || (t.requiresProof && !hasFile)} style={{ marginTop: 4 }}>
              Mark done
            </button>{" "}
            <button type="button" onClick={() => setShowBlockedForm(true)} disabled={pending}>
              Couldn&apos;t complete it
            </button>
          </form>
        </div>
      )}

      {t.status === "approved" && showBlockedForm && (
        <form
          action={(fd) => {
            fd.set("taskId", t.id);
            fd.set("note", note);
            run(fd, markTaskBlocked);
            setShowBlockedForm(false);
          }}
        >
          <textarea
            rows={2}
            style={{ width: "100%" }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why couldn't this be completed? Any comments/observations…"
          />
          <button type="submit" disabled={pending || !note.trim()}>
            Submit
          </button>{" "}
          <button
            type="button"
            onClick={() => {
              setShowBlockedForm(false);
              setNote("");
            }}
            disabled={pending}
          >
            Cancel
          </button>
        </form>
      )}

      {(t.status === "done" || t.status === "blocked") && (
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
    </div>
  );
}

// url is a freshly-generated signed URL (see app/tasks/data.ts) — the
// task-proofs bucket is private, so this only works because it's created
// server-side on every page load, not a permanent public link.
function ProofPreview({ url, type }: { url: string; type: string | null }) {
  if (type === "photo") {
    // eslint-disable-next-line @next/next/no-img-element -- signed URL, not something next/image's optimizer should cache
    return <img src={url} alt="Proof of completion" style={{ maxWidth: "100%", maxHeight: 240, display: "block", marginTop: 4 }} />;
  }
  if (type === "video") {
    return <video src={url} controls style={{ maxWidth: "100%", maxHeight: 240, display: "block", marginTop: 4 }} />;
  }
  if (type === "audio") {
    return <audio src={url} controls style={{ display: "block", marginTop: 4 }} />;
  }
  return (
    <p style={{ margin: "4px 0" }}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        View proof document
      </a>
    </p>
  );
}
