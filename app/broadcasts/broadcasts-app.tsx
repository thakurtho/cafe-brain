"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendBroadcast, acknowledgeBroadcast } from "./actions";
import { APPROVER_TIERS } from "../tasks/tiers";
import { MicButton } from "../mic-button";
import { Nav } from "../nav";
import type { PersonOption, BroadcastRow } from "./data";

const ACTING_AS_STORAGE_KEY = "outlet-brain-acting-as"; // shared with Tasks — one identity across the whole test app

const TIER_LABELS: Record<string, string> = {
  floor_staff: "Floor staff",
  shift_manager: "Shift leads",
  outlet_manager: "Outlet managers",
  gm_owner: "GM/Owner",
};

export function BroadcastsApp({ people, broadcasts }: { people: PersonOption[]; broadcasts: BroadcastRow[] }) {
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
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 700 }}>
      <Nav current="broadcasts" />
      <h1>Outlet Brain — Broadcasts</h1>

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

      {isManager && <SendBroadcastForm actingAsId={actingAsId} />}

      <hr style={{ margin: "1.5rem 0" }} />
      <h2>Recent broadcasts</h2>
      {broadcasts.length === 0 && <p style={{ color: "#888" }}>None yet.</p>}
      {broadcasts.map((b) => (
        <BroadcastCard key={b.id} broadcast={b} people={people} actingAsId={actingAsId} isManager={isManager} />
      ))}
    </main>
  );
}

function SendBroadcastForm({ actingAsId }: { actingAsId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [important, setImportant] = useState(false);
  const [target, setTarget] = useState("");

  return (
    <section>
      <h2>Send a broadcast</h2>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            try {
              await sendBroadcast(formData);
              setMessage("");
              setImportant(false);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <input type="hidden" name="actingAsUserId" value={actingAsId} />
        <div style={{ display: "flex", gap: 6 }}>
          <textarea
            name="message"
            rows={2}
            style={{ width: "100%" }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Closing early today at 6pm for maintenance"
          />
          <MicButton value={message} onChange={setMessage} />
        </div>
        <div style={{ marginTop: 4 }}>
          <label>
            Target:{" "}
            <select name="targetAccessTier" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Everyone</option>
              {Object.entries(TIER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ marginLeft: 12 }}>
            <input type="checkbox" name="important" checked={important} onChange={(e) => setImportant(e.target.checked)} /> Important
            (tracks who&apos;s seen it)
          </label>
        </div>
        <button type="submit" disabled={pending || !message.trim()} style={{ marginTop: 6 }}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}

function BroadcastCard({
  broadcast: b,
  people,
  actingAsId,
  isManager,
}: {
  broadcast: BroadcastRow;
  people: PersonOption[];
  actingAsId: string;
  isManager: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const iAcked = b.ackedUserIds.includes(actingAsId);
  const ackedNames = b.ackedUserIds.map((id) => people.find((p) => p.id === id)?.name ?? "Unknown");

  return (
    <div style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.5rem" }}>
      {b.important && (
        <span style={{ fontSize: "0.75em", padding: "2px 8px", borderRadius: 10, background: "#F5DAD7", color: "#A83B32" }}>
          Important
        </span>
      )}
      <p style={{ margin: "6px 0 0" }}>{b.message}</p>
      <p style={{ margin: "4px 0", fontSize: "0.85em", color: "#555" }}>
        {b.senderName ?? "Unknown"} · to {b.targetAccessTier ? TIER_LABELS[b.targetAccessTier] ?? b.targetAccessTier : "everyone"} ·{" "}
        {b.createdAt}
      </p>
      {b.important && (
        <>
          <form
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                try {
                  await acknowledgeBroadcast(fd);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              });
            }}
          >
            <input type="hidden" name="broadcastId" value={b.id} />
            <input type="hidden" name="actingAsUserId" value={actingAsId} />
            {iAcked ? (
              <span style={{ color: "#3C7A4E", fontSize: "0.9em" }}>✓ You&apos;ve seen this</span>
            ) : (
              <button type="submit" disabled={pending}>
                Mark as seen
              </button>
            )}
          </form>
          {isManager && (
            <p style={{ fontSize: "0.85em", color: "#888", marginTop: 4 }}>
              Seen by: {ackedNames.length > 0 ? ackedNames.join(", ") : "no one yet"}
            </p>
          )}
        </>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
