"use client";

import { useEffect, useState } from "react";
import { APPROVER_TIERS, ADMIN_TIERS } from "../tasks/tiers";
import { DrillDownThread } from "../drill-down-thread";
import { Nav } from "../nav";
import type { PersonOption, TaskRow, SuggestionRow, ComplianceCardRow } from "../tasks/data";
import type { SwapRequestRow } from "../shifts/data";
import type { BroadcastRow } from "../broadcasts/data";
import type { KnowledgeGapRow, DiscrepancyRow } from "./data";

const ACTING_AS_STORAGE_KEY = "outlet-brain-acting-as";

type NotificationItem = {
  id: string;
  text: string;
  entityType?: "pattern" | "task";
  entityId?: string;
  href?: string;
};

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function buildNotifications(
  actingAsId: string,
  isManager: boolean,
  isAdmin: boolean,
  data: {
    tasks: TaskRow[];
    suggestions: SuggestionRow[];
    complianceCards: ComplianceCardRow[];
    swaps: SwapRequestRow[];
    broadcasts: BroadcastRow[];
    knowledgeGaps: KnowledgeGapRow[];
    discrepancies: DiscrepancyRow[];
  }
): NotificationItem[] {
  const items: NotificationItem[] = [];

  // Personal: tasks assigned to me.
  for (const t of data.tasks) {
    if (t.assignedTo !== actingAsId || t.archived) continue;
    if (t.status === "approved" && daysUntil(t.dueDate) <= 2) {
      items.push({
        id: `due-${t.id}`,
        text: `Due ${daysUntil(t.dueDate) < 0 ? "overdue" : "soon"} (${t.dueDate}): "${t.description}"`,
        entityType: "task",
        entityId: t.id,
      });
    } else if (t.status === "pending_approval" || t.status === "approved") {
      items.push({ id: `assigned-${t.id}`, text: `Assigned to you: "${t.description}"`, entityType: "task", entityId: t.id });
    }
  }

  // Manager: patterns awaiting review, extension requests, knowledge gaps,
  // shift-handover discrepancies, swaps needing a decision.
  if (isManager) {
    for (const s of data.suggestions) {
      items.push({ id: `pattern-${s.patternId}`, text: `Pattern needs review: "${s.summary}"`, entityType: "pattern", entityId: s.patternId });
    }
    for (const t of data.tasks) {
      if (t.extensionRequested) {
        items.push({
          id: `ext-${t.id}`,
          text: `Extension requested (wants until ${t.requestedDueDate}): "${t.description}"`,
          entityType: "task",
          entityId: t.id,
        });
      }
    }
    for (const g of data.knowledgeGaps) {
      items.push({ id: `gap-${g.id}`, text: `Knowledge gap needs an answer: "${g.questionText}"` });
    }
    for (const d of data.discrepancies) {
      items.push({ id: `disc-${d.id}`, text: `Shift handover discrepancy flagged${d.note ? `: "${d.note}"` : ""}`, href: "/tasks" });
    }
    for (const r of data.swaps) {
      if (r.status === "pending") {
        items.push({
          id: `swap-decide-${r.id}`,
          text: `Shift swap needs a decision: ${r.requestedByName}, ${r.shiftDate} ${r.startTime}–${r.endTime}`,
          href: "/shifts",
        });
      }
    }
  }

  // Admin only: approaching compliance deadlines.
  if (isAdmin) {
    for (const c of data.complianceCards) {
      items.push({ id: `compliance-${c.id}`, text: `Compliance ${c.priorityLabel.toLowerCase()}: ${c.topic}`, href: "/tasks" });
    }
  }

  // Everyone: open swaps needing a volunteer (not your own), important
  // broadcasts targeted at you that you haven't acknowledged.
  for (const r of data.swaps) {
    if (r.status === "pending" && !r.volunteerId && r.requestedById !== actingAsId) {
      items.push({
        id: `swap-open-${r.id}`,
        text: `${r.requestedByName} needs coverage on ${r.shiftDate}, ${r.startTime}–${r.endTime} — can you help?`,
        href: "/shifts",
      });
    }
  }
  for (const b of data.broadcasts) {
    if (!b.important || b.ackedUserIds.includes(actingAsId)) continue;
    items.push({ id: `broadcast-${b.id}`, text: `Broadcast: "${b.message}"`, href: "/broadcasts" });
  }

  return items;
}

export function NotificationsApp(props: {
  people: PersonOption[];
  tasks: TaskRow[];
  suggestions: SuggestionRow[];
  complianceCards: ComplianceCardRow[];
  swaps: SwapRequestRow[];
  broadcasts: BroadcastRow[];
  knowledgeGaps: KnowledgeGapRow[];
  discrepancies: DiscrepancyRow[];
}) {
  const { people } = props;
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

  const items = buildNotifications(actingAsId, isManager, isAdmin, props);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 700 }}>
      <Nav current="notifications" />
      <h1>🔔 Notifications</h1>
      <p style={{ fontSize: "0.85em", color: "#888" }}>
        A live view of what needs your attention right now — not push alerts, and nothing here is marked
        read/dismissed yet (see the code comments for why). Reload after acting elsewhere to refresh.
      </p>

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

      {items.length === 0 && <p style={{ color: "#888" }}>Nothing needs your attention right now.</p>}
      {items.map((n) => (
        <div key={n.id} style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.5rem" }}>
          <p style={{ margin: 0 }}>{n.text}</p>
          {n.entityType && n.entityId ? (
            <DrillDownThread entityType={n.entityType} entityId={n.entityId} actingAsId={actingAsId} defaultOpen />
          ) : n.href ? (
            <p style={{ margin: "4px 0 0" }}>
              <a href={n.href}>Open →</a>
            </p>
          ) : null}
        </div>
      ))}
    </main>
  );
}
