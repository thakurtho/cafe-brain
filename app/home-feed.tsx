import { getHomeFeedData } from "./home-data";
import { archiveLog } from "./actions";

// Server Component — no client JS needed. Archiving is a plain <form>
// action (progressive enhancement), same as the rest of this thin slice's
// gated pages.
export async function HomeFeed() {
  const items = await getHomeFeedData();

  return (
    <section>
      <h2>Outlet Updates</h2>
      {items.length === 0 && <p style={{ color: "#888" }}>Nothing yet — Tells land here once classified.</p>}
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            border: "1px solid #ddd",
            borderLeft:
              item.kind === "incident" ? "4px solid #c77" : item.kind === "broadcast" ? "4px solid #57c" : "4px solid #ccc",
            padding: "0.5rem 0.75rem",
            marginBottom: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <div>
            <p style={{ margin: 0 }}>
              {item.kind === "incident" && <b style={{ color: "#c77" }}>[Resolved incident] </b>}
              {item.kind === "broadcast" && <b style={{ color: "#57c" }}>[Broadcast{item.senderName ? ` — ${item.senderName}` : ""}] </b>}
              {item.summary}
              {item.isCashRelated && (
                <span style={{ marginLeft: 6, fontSize: "0.8em", color: "#a67c00" }}>💵 Cash</span>
              )}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "0.8em", color: "#888" }}>
              {item.kind === "broadcast" ? "Broadcast" : item.subjectLabel ?? "General"} ·{" "}
              {new Date(item.createdAt).toLocaleString()}
            </p>
          </div>
          {item.kind === "log" && (
            <form
              action={async () => {
                "use server";
                await archiveLog(item.id);
              }}
            >
              <button type="submit" style={{ fontSize: "0.8em" }}>
                Archive
              </button>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
