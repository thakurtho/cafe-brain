import { isUnlocked } from "@/lib/access";
import { Gate } from "./gate";
import { AskTellApp } from "./ask-tell-app";
import { HomeFeed } from "./home-feed";
import { TellDebugPanel } from "./tell-debug-panel";

// Server Component (no "use client") so it can check the access cookie
// before anything renders — the gated app never even reaches the browser
// unless the cookie's already valid.
export default function Home() {
  if (!isUnlocked()) return <Gate />;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
      <AskTellApp feed={<HomeFeed />} />
      <TellDebugPanel />
    </div>
  );
}
