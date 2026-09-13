"use client";

import { useState, useTransition } from "react";
import { openDrillDown, sendDrillDownMessage } from "./drill-down-actions";
import { MicButton } from "./mic-button";

type Message = { sender: string; text: string };

/**
 * "Discuss this" — a follow-up conversation about a specific pattern or
 * task, using the same session/message capture layer as Tell, just kept
 * open across multiple exchanges instead of closed after one.
 */
export function DrillDownThread({
  entityType,
  entityId,
  actingAsId,
  defaultOpen,
}: {
  entityType: "pattern" | "task";
  entityId: string;
  actingAsId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [loaded, setLoaded] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function ensureLoaded() {
    if (loaded) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("entityType", entityType);
        fd.set("entityId", entityId);
        fd.set("actingAsUserId", actingAsId);
        const result = await openDrillDown(fd);
        setSessionId(result.sessionId);
        setMessages(result.messages);
        setLoaded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) ensureLoaded();
  }

  function send() {
    if (!sessionId || !question.trim()) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("sessionId", sessionId);
        fd.set("entityType", entityType);
        fd.set("entityId", entityId);
        fd.set("question", question);
        const result = await sendDrillDownMessage(fd);
        setMessages(result.messages);
        setQuestion("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" onClick={toggle} style={{ fontSize: "0.85em" }}>
        {open ? "Hide conversation" : "💬 Discuss / ask more"}
      </button>
      {open && (
        <div style={{ background: "#eef1f4", padding: 8, marginTop: 4 }}>
          {pending && messages.length === 0 && <p style={{ fontSize: "0.85em", color: "#888" }}>Loading…</p>}
          {messages.map((m, i) => (
            <p key={i} style={{ margin: "4px 0", fontSize: "0.9em" }}>
              <b>{m.sender === "assistant" ? "Outlet Brain" : "You"}:</b> {m.text}
            </p>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask more about this…"
              style={{ flex: 1 }}
              disabled={!loaded}
            />
            <MicButton value={question} onChange={setQuestion} />
            <button type="button" onClick={send} disabled={pending || !loaded || !question.trim()}>
              Send
            </button>
          </div>
          {error && <p style={{ color: "crimson", fontSize: "0.85em" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
