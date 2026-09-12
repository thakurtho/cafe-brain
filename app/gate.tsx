"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlock } from "./actions";

/**
 * The password screen itself is not the security boundary — it's just the
 * UI. The real check is requireAccess() inside every Server Action. This
 * only exists so a legitimate visitor doesn't have to know a magic cookie
 * needs setting.
 */
export function Gate() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 360 }}>
      <h1>Outlet Brain</h1>
      <p>Enter the access code to continue.</p>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await unlock(formData);
            if (result.ok) {
              router.refresh();
            } else {
              setError(result.error ?? "Wrong code.");
            }
          });
        }}
      >
        <input
          type="password"
          name="code"
          autoFocus
          autoComplete="off"
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
        />
        <button type="submit" disabled={pending} style={{ marginTop: 8 }}>
          {pending ? "Checking…" : "Unlock"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
