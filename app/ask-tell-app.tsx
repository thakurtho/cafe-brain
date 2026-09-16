"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  openTellSession,
  sendTellMessage,
  submitAsk,
  type TellMessage,
  type TellClassificationResult,
  type AskResult,
} from "./actions";
import { MicButton } from "./mic-button";
import { Nav } from "./nav";

export function AskTellApp({ feed }: { feed: ReactNode }) {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
      <Nav current="ask-tell" />
      <h1>Outlet Brain — Ask / Tell test harness</h1>
      <p>
        No user auth. Every Tell is logged as Aman Rawat. Reads/writes go straight to the seeded
        Musafir Cafe data. 🎤 uses the browser&apos;s built-in speech-to-text (Chrome/Edge only,
        free, no account) — good enough for testing, not for Hindi/regional languages yet.
      </p>
      {feed}
      <hr style={{ margin: "2rem 0" }} />
      <TellThread />
      <hr style={{ margin: "2rem 0" }} />
      <AskBox />
    </main>
  );
}

// Tell is now a real conversation (Schema Living Doc v4 §0): Outlet Brain
// may ask a follow-up ("is it fixed now? who fixed it?") before it has
// enough to classify, and one session can produce more than one
// classification (e.g. a resolved incident that's also a judgment call).
function TellThread() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TellMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<TellClassificationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function ensureSession(cb: (sid: string) => void) {
    if (sessionId) {
      cb(sessionId);
      return;
    }
    startTransition(async () => {
      try {
        const opened = await openTellSession();
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
          const r = await sendTellMessage(fd);
          setMessages(r.messages);
          setDone(r.done);
          if (r.results) setResults(r.results);
          setText("");
          // Re-run this page's Server Components (Outlet Updates feed, the
          // debug panel) so a finalized Tell shows up without a manual
          // reload — cheap since neither depends on this component's own
          // client state.
          if (r.done) router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    });
  }

  function startNew() {
    setSessionId(null);
    setMessages([]);
    setText("");
    setDone(false);
    setResults(null);
    setError(null);
  }

  return (
    <section>
      <h2>Tell</h2>
      {messages.length === 0 && (
        <p style={{ color: "#888", fontSize: "0.9em" }}>
          {`e.g. "Machine 2 is running slow" or "Shweta didn't like her coffee, we remade it"`}
        </p>
      )}
      {messages.map((m, i) => (
        <p key={i} style={{ margin: "4px 0" }}>
          <b>{m.sender === "assistant" ? "Outlet Brain" : "You"}:</b> {m.text}
        </p>
      ))}
      {!done && (
        <div style={{ marginTop: 8 }}>
          <textarea
            rows={2}
            style={{ width: "100%" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tell Outlet Brain what happened…"
          />
          <div style={{ marginTop: 4 }}>
            <button type="button" onClick={send} disabled={pending || !text.trim()}>
              {pending ? "…" : "Send"}
            </button>
            <MicButton value={text} onChange={setText} />
          </div>
        </div>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {done && results && (
        <div style={{ border: "1px solid #ccc", padding: "0.75rem", marginTop: "0.75rem" }}>
          {results.map((r, i) => (
            <div key={i} style={{ marginBottom: i < results.length - 1 ? 10 : 0 }}>
              <p>
                <b>Classified as:</b> {r.contentType} {r.subject ? `(${r.subject})` : ""} (
                {Math.round(r.confidence * 100)}% confident)
              </p>
              <p>
                <b>Why:</b> {r.reasoning}
              </p>
              <p>
                <b>Saved to:</b> {r.savedTable ?? "nothing — classified as 'none'"}
              </p>
              {r.savedRecord && (
                <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: "0.5rem" }}>
                  {JSON.stringify(r.savedRecord, null, 2)}
                </pre>
              )}
            </div>
          ))}
          <button type="button" onClick={startNew} style={{ marginTop: 8 }}>
            Start a new Tell
          </button>
        </div>
      )}
    </section>
  );
}

function AskBox() {
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      <h2>Ask</h2>
      <form
        action={(formData) => {
          setError(null);
          setResult(null);
          startTransition(async () => {
            try {
              const r = await submitAsk(formData);
              setResult(r);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <textarea
          name="question"
          rows={2}
          style={{ width: "100%" }}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`e.g. "What's the recipe for a cappuccino?" or "What's Shweta's usual order?"`}
        />
        <div style={{ marginTop: 4 }}>
          <button type="submit" disabled={pending}>
            {pending ? "Thinking…" : "Ask"}
          </button>
          <MicButton value={question} onChange={setQuestion} />
        </div>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {result && (
        <div style={{ border: "1px solid #ccc", padding: "0.75rem", marginTop: "0.75rem" }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p>
        </div>
      )}
    </section>
  );
}
