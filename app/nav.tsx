// Plain links, no client state — safe to use from both Server and Client
// Components. Kept as one shared place now that there are 5 routes,
// rather than each page hand-rolling its own cross-links.
export function Nav({ current }: { current: "ask-tell" | "tasks" | "broadcasts" | "shifts" | "notifications" }) {
  const links: Array<{ href: string; label: string; key: typeof current }> = [
    { href: "/", label: "Ask / Tell", key: "ask-tell" },
    { href: "/tasks", label: "Tasks", key: "tasks" },
    { href: "/broadcasts", label: "Broadcasts", key: "broadcasts" },
    { href: "/shifts", label: "Shift swaps", key: "shifts" },
    { href: "/notifications", label: "🔔 Notifications", key: "notifications" },
  ];
  return (
    <p>
      {links.map((l, i) => (
        <span key={l.key}>
          {i > 0 && " · "}
          {l.key === current ? <b>{l.label}</b> : <a href={l.href}>{l.label}</a>}
        </span>
      ))}
    </p>
  );
}
