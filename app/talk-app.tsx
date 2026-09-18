"use client";

import { useState, useRef, useEffect, useCallback, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  openTalkSession,
  sendTalkMessage,
  endTalkSession,
  type TalkMessage,
  type TellClassificationResult,
} from "./actions";
import { MicButton } from "./mic-button";
import { Nav } from "./nav";

const TALK_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function TalkApp({ feed }: { feed: ReactNode }) {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
      <Nav current="talk" />
      <h1>Outlet Brain</h1>
      <p>
        No user auth. Every message is logged as Aman Rawat. Reads/writes go straight to the seeded
        Musafir Cafe data. 🎤 uses the browser&apos;s built-in speech-to-text (Chrome/Edge only,
        free, no account) — good enough for testing, not for Hindi/regional languages yet.
      </p>
      {feed}
      <hr style={{ margin: "2rem 0" }} />
      <TalkThread />
    </main>
  );
}

// Ask and Tell, merged into one conversation. A message can report
// something, ask something, or both in the same breath — the model
// decides per turn whether to ask a clarifying question, answer from the
// knowledge base, or record something (which does NOT end the
// conversation, unlike the old separate Tell flow). Ends only via "End
// conversation" or a 5-minute idle timeout, backed up server-side by
// sweepStaleTalkSessions (lib/talk-session.ts) in case the tab closes
// before the client timer fires.
function TalkThread() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [closed, setClosed] = useState(false);
  const [loggedResults, setLoggedResults] = useState<TellClassificationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endConversation = useCallback(
    (sid: string) => {
      startTransition(async () => {
        try {
          const fd = new FormData();
          fd.set("sessionId", sid);
          await endTalkSession(fd);
          setClosed(true);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    },
    [router]
  );

  function resetIdleTimer(sid: string) {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => endConversation(sid), TALK_IDLE_TIMEOUT_MS);
  }

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  function ensureSession(cb: (sid: string) => void) {
    if (sessionId) {
      cb(sessionId);
      return;
    }
    startTransition(async () => {
      try {
        const opened = await openTalkSession();
        setSessionId(opened.sessionId);
        cb(opened.sessionId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function send() {
    if (!text.trim()) return;
    setError(null);
    ensureSession((sid) => {
      startTransition(async () => {
        try {
          const fd = new FormData();
          fd.set("sessionId", sid);
          fd.set("text", text);
          const r = await sendTalkMessage(fd);
          setMessages(r.messages);
          setText("");
          resetIdleTimer(sid);
          const newlyLogged = (r.results ?? []).filter((res) => res.contentType !== "none");
          if (newlyLogged.length > 0) {
            setLoggedResults((prev) => [...prev, ...newlyLogged]);
            // Something just landed in logs/incidents/tasks/judgment_calls
            // — refresh this page's Server Components (Outlet Updates
            // feed, the debug panel) so it shows up without a reload.
            router.refresh();
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    });
  }

  function startNew() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setSessionId(null);
    setMessages([]);
    setText("");
    setClosed(false);
    setLoggedResults([]);
    setError(null);
  }

  return (
    <section>
      <h2>Talk to Outlet Brain</h2>
      {messages.length === 0 && (
        <p style={{ color: "#888", fontSize: "0.9em" }}>
          {`e.g. "Machine 2 is running slow" or "What's the recipe for a cappuccino?" — report something, ask something, or both at once.`}
        </p>
      )}
      {messages.map((m, i) => (
        <p key={i} style={{ margin: "4px 0" }}>
          <b>{m.sender === "assistant" ? "Outlet Brain" : "You"}:</b> {m.text}
        </p>
      ))}
      {!closed && (
        <div style={{ marginTop: 8 }}>
          <textarea
            rows={2}
            style={{ width: "100%" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Talk to Outlet Brain…"
          />
          <div style={{ marginTop: 4 }}>
            <button type="button" onClick={send} disabled={pending || !text.trim()}>
              {pending ? "…" : "Send"}
            </button>
            <MicButton value={text} onChange={setText} />
            {sessionId && (
              <button type="button" onClick={() => endConversation(sessionId)} disabled={pending} style={{ marginLeft: 8 }}>
                End conversation
              </button>
            )}
          </div>
          {sessionId && (
            <p style={{ color: "#999", fontSize: "0.75em", marginTop: 4 }}>
              Auto-ends after 5 minutes of inactivity if you forget to click &quot;End conversation.&quot;
            </p>
          )}
        </div>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loggedResults.length > 0 && (
        <div style={{ border: "1px solid #ccc", padding: "0.75rem", marginTop: "0.75rem" }}>
          <p style={{ margin: "0 0 6px", fontWeight: "bold" }}>Logged this conversation:</p>
          {loggedResults.map((r, i) => (
            <div key={i} style={{ marginBottom: i < loggedResults.length - 1 ? 10 : 0 }}>
              <p style={{ margin: 0 }}>
                <b>{r.contentType}</b> {r.subject ? `(${r.subject})` : ""} ({Math.round(r.confidence * 100)}% confident) →{" "}
                {r.savedTable}
              </p>
              <p style={{ margin: "2px 0", color: "#666" }}>{r.reasoning}</p>
              {r.savedRecord && (
                <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: "0.5rem", fontSize: "0.85em" }}>
                  {JSON.stringify(r.savedRecord, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      {closed && (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ color: "#888" }}>Conversation ended.</p>
          <button type="button" onClick={startNew} style={{ marginTop: 8 }}>
            Start a new conversation
          </button>
        </div>
      )}
    </section>
  );
}
