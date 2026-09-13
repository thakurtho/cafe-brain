"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask, approveTask, markTaskDone, approvePatternAsTask } from "./actions";
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
  const canApprove = !!actingAs && APPROVER_TIERS.has(actingAs.access_tier);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
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

      <hr style={{ margin: "2rem 0" }} />
      <SuggestionsList suggestions={suggestions} actingAsId={actingAsId} canApprove={canApprove} />

      <hr style={{ margin: "2rem 0" }} />
      <TaskList tasks={tasks} actingAsId={actingAsId} canApprove={canApprove} />
    </main>
  );
}

function AddTaskForm({ people, actingAsId }: { people: PersonOption[]; actingAsId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
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
  suggestions,
  actingAsId,
  canApprove,
}: {
  suggestions: SuggestionRow[];
  actingAsId: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      <h2>Suggested tasks (from patterns)</h2>
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
            {canApprove ? (
              <button type="submit" disabled={pending}>
                {pending ? "Approving…" : "Approve as task"}
              </button>
            ) : (
              <span style={{ color: "#888", fontSize: "0.9em" }}>Needs a manager to approve.</span>
            )}
          </form>
        </div>
      ))}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}

function TaskList({
  tasks,
  actingAsId,
  canApprove,
}: {
  tasks: TaskRow[];
  actingAsId: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (fd: FormData) => Promise<void>, formData: FormData) {
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
    <section>
      <h2>Tasks</h2>
      {tasks.length === 0 && <p style={{ color: "#888" }}>No tasks yet.</p>}
      {tasks.map((t) => (
        <div key={t.id} style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.5rem" }}>
          <p style={{ margin: 0, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.description}</p>
          <p style={{ margin: "4px 0", fontSize: "0.9em", color: "#555" }}>
            {t.selfAssigned ? "Self-added" : `Assigned by ${t.createdByName ?? "unknown"}`}
            {t.assignedToName ? ` · for ${t.assignedToName}` : ""} · <b>{t.status}</b>
            {t.approvedByName ? ` (approved by ${t.approvedByName})` : ""}
          </p>
          {t.status === "pending_approval" &&
            (canApprove ? (
              <form
                action={(fd) => {
                  fd.set("taskId", t.id);
                  fd.set("actingAsUserId", actingAsId);
                  run(approveTask, fd);
                }}
              >
                <button type="submit" disabled={pending}>
                  Approve
                </button>
              </form>
            ) : (
              <span style={{ color: "#888", fontSize: "0.9em" }}>Needs a manager to approve.</span>
            ))}
          {t.status === "approved" && (
            <form
              action={(fd) => {
                fd.set("taskId", t.id);
                run(markTaskDone, fd);
              }}
            >
              <button type="submit" disabled={pending}>
                Mark done
              </button>
            </form>
          )}
        </div>
      ))}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}
