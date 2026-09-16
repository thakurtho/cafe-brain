import { getRecentTellDebugData } from "./tell-debug-data";

// TEST-HARNESS ONLY — not part of the real app. See tell-debug-data.ts's
// header comment for why this exists and when to delete it.
export async function TellDebugPanel() {
  const rows = await getRecentTellDebugData();

  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        background: "#fffbe6",
        border: "1px dashed #d4b106",
        padding: "0.75rem",
        fontSize: "0.8em",
        maxHeight: "90vh",
        overflowY: "auto",
      }}
    >
      <p style={{ margin: 0, fontWeight: "bold" }}>🐛 Debug — Tell classification history</p>
      <p style={{ margin: "2px 0 10px", color: "#8a6d00" }}>
        Test harness only. Not part of the real app — Team/Approve-Review screens will replace this.
      </p>
      {rows.length === 0 && <p style={{ color: "#888" }}>No Tells classified yet.</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}>
          <p style={{ margin: 0 }}>
            <b>{r.contentType}</b>
            {r.subject ? ` · ${r.subject}` : ""}
            {r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ""}
          </p>
          <p style={{ margin: "2px 0" }}>{r.summaryText ?? "(no linked record)"}</p>
          <p style={{ margin: 0, color: "#999" }}>
            {r.savedTable ?? "not saved"} · {new Date(r.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </aside>
  );
}
