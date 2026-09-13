"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestShiftSwap, volunteerForSwap, withdrawVolunteer, approveSwap, rejectSwap } from "./actions";
import { APPROVER_TIERS } from "../tasks/tiers";
import { MicButton } from "../mic-button";
import { Nav } from "../nav";
import type { PersonOption, SwapRequestRow } from "./data";

const ACTING_AS_STORAGE_KEY = "outlet-brain-acting-as"; // shared identity across the whole test app

export function ShiftsApp({ people, requests }: { people: PersonOption[]; requests: SwapRequestRow[] }) {
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
      <Nav current="shifts" />
      <h1>Outlet Brain — Shift swap requests</h1>

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

      <RequestSwapForm actingAsId={actingAsId} />

      <hr style={{ margin: "1.5rem 0" }} />
      <h2>Requests</h2>
      {requests.length === 0 && <p style={{ color: "#888" }}>None yet.</p>}
      {requests.map((r) => (
        <SwapCard key={r.id} request={r} actingAsId={actingAsId} isManager={isManager} />
      ))}
    </main>
  );
}

function RequestSwapForm({ actingAsId }: { actingAsId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shiftDate, setShiftDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  return (
    <section>
      <h2>Request coverage</h2>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            try {
              await requestShiftSwap(formData);
              setShiftDate("");
              setStartTime("");
              setEndTime("");
              setReason("");
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <input type="hidden" name="actingAsUserId" value={actingAsId} />
        <label>
          Shift date: <input type="date" name="shiftDate" required value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
        </label>{" "}
        <label>
          From: <input type="time" name="startTime" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>{" "}
        <label>
          To: <input type="time" name="endTime" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <textarea
            name="reason"
            rows={2}
            style={{ width: "100%" }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why do you need coverage?"
          />
          <MicButton value={reason} onChange={setReason} />
        </div>
        <button type="submit" disabled={pending || !shiftDate || !startTime || !endTime || !reason.trim()} style={{ marginTop: 6 }}>
          {pending ? "Sending…" : "Request coverage"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}

function SwapCard({ request: r, actingAsId, isManager }: { request: SwapRequestRow; actingAsId: string; isManager: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  const isMine = r.requestedById === actingAsId;
  const iAmVolunteer = r.volunteerId === actingAsId;

  return (
    <div style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.5rem" }}>
      <p style={{ margin: 0 }}>
        <b>{r.requestedByName}</b> needs coverage — {r.shiftDate}, {r.startTime}–{r.endTime}
      </p>
      <p style={{ margin: "4px 0", fontSize: "0.9em", fontStyle: "italic", color: "#555" }}>&ldquo;{r.reason}&rdquo;</p>
      <p style={{ margin: "4px 0", fontSize: "0.9em" }}>
        Status: <b>{r.status}</b>
        {r.volunteerName ? ` · covering: ${r.volunteerName}` : " · no volunteer yet"}
        {r.approvedByName ? ` (decided by ${r.approvedByName})` : ""}
      </p>

      {r.status === "pending" && !isMine && !r.volunteerId && (
        <form
          action={(fd) => {
            fd.set("swapId", r.id);
            fd.set("actingAsUserId", actingAsId);
            run(fd, volunteerForSwap);
          }}
        >
          <button type="submit" disabled={pending}>
            I&apos;ll cover this
          </button>
        </form>
      )}
      {r.status === "pending" && iAmVolunteer && (
        <form
          action={(fd) => {
            fd.set("swapId", r.id);
            run(fd, withdrawVolunteer);
          }}
        >
          <button type="submit" disabled={pending}>
            Withdraw my offer
          </button>
        </form>
      )}
      {r.status === "pending" && isManager && (
        <>
          <form
            action={(fd) => {
              fd.set("swapId", r.id);
              fd.set("actingAsUserId", actingAsId);
              run(fd, approveSwap);
            }}
            style={{ display: "inline" }}
          >
            <button type="submit" disabled={pending}>
              Approve
            </button>
          </form>{" "}
          <form
            action={(fd) => {
              fd.set("swapId", r.id);
              fd.set("actingAsUserId", actingAsId);
              run(fd, rejectSwap);
            }}
            style={{ display: "inline" }}
          >
            <button type="submit" disabled={pending}>
              Reject
            </button>
          </form>
        </>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
