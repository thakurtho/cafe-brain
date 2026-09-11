"use client";

import { useState, useTransition } from "react";
import { submitTell, submitAsk, type TellResult, type AskResult } from "./actions";

export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Outlet Brain — Ask / Tell test harness</h1>
      <p>
        Typed input only, no auth. Every Tell is logged as Aman Rawat. Reads/writes go straight
        to the seeded Musafir Cafe data.
      </p>
      <TellBox />
      <hr style={{ margin: "2rem 0" }} />
      <AskBox />
    </main>
  );
}

function TellBox() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TellResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      <h2>Tell</h2>
      <form
        action={(formData) => {
          setError(null);
          setResult(null);
          startTransition(async () => {
            try {
              setResult(await submitTell(formData));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <textarea
          name="text"
          rows={3}
          style={{ width: "100%" }}
          placeholder={`e.g. "Machine 2 is running slow" or "Shweta didn't like her coffee, we remade it"`}
        />
        <br />
        <button type="submit" disabled={pending}>
          {pending ? "Classifying…" : "Submit"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {result && (
        <div style={{ border: "1px solid #ccc", padding: "0.75rem", marginTop: "0.75rem" }}>
          <p>
            <b>Classified as:</b> {result.classification} ({Math.round(result.confidence * 100)}% confident)
          </p>
          <p>
            <b>Why:</b> {result.reasoning}
          </p>
          <p>
            <b>Saved to:</b> {result.savedTable ?? "nothing — classified as 'none'"}
          </p>
          {result.savedRecord && (
            <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: "0.5rem" }}>
              {JSON.stringify(result.savedRecord, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

function AskBox() {
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
              setResult(await submitAsk(formData));
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
          placeholder={`e.g. "What's the recipe for a cappuccino?" or "What's Shweta's usual order?"`}
        />
        <br />
        <button type="submit" disabled={pending}>
          {pending ? "Thinking…" : "Ask"}
        </button>
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
