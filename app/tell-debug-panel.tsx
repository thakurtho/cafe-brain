import { getRecentTellDebugData, getRecentKnowledgeGaps } from "./tell-debug-data";

// TEST-HARNESS ONLY — not part of the real app. See tell-debug-data.ts's
// header comment for why this exists and when to delete it.
export async function TellDebugPanel() {
  const [rows, knowledgeGaps] = await Promise.all([getRecentTellDebugData(), getRecentKnowledgeGaps()]);

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
      <p style={{ margin: 0, fontWeight: "bold" }}>🐛 Debug — classification history</p>
      <p style={{ margin: "2px 0 10px", color: "#8a6d00" }}>
        Test harness only. Not part of the real app — Team/Approve-Review screens will replace this.
      </p>
      {rows.length === 0 && <p style={{ color: "#888" }}>Nothing classified yet.</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}>
          <p style={{ margin: 0 }}>
            <b>[{r.sessionMode}]</b> <b>{r.contentType}</b>
            {r.subject ? ` · ${r.subject}` : ""}
            {r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ""}
            {r.isCashRelated ? " · 💵" : ""}
          </p>
          <p style={{ margin: "2px 0" }}>
            {r.contentType === "query" ? "(plain lookup, no separate record)" : r.summaryText ?? "(no linked record)"}
          </p>
          <p style={{ margin: 0, color: "#999" }}>
            {r.savedTable ?? "not saved"} · {new Date(r.createdAt).toLocaleString()}
          </p>
        </div>
      ))}

      <p style={{ margin: "12px 0 0", fontWeight: "bold" }}>Knowledge gaps</p>
      <p style={{ margin: "2px 0 8px", color: "#8a6d00" }}>Written directly on a failed Ask, not via classification above.</p>
      {knowledgeGaps.length === 0 && <p style={{ color: "#888" }}>None yet.</p>}
      {knowledgeGaps.map((g) => (
        <div key={g.id} style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}>
          <p style={{ margin: 0 }}>
            {g.questionText} <span style={{ color: "#999" }}>(×{g.occurrenceCount}, {g.status})</span>
          </p>
          <p style={{ margin: 0, color: "#999" }}>{new Date(g.createdAt).toLocaleString()}</p>
        </div>
      ))}
    </aside>
  );
}
