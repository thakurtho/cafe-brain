import { isUnlocked } from "@/lib/access";
import { Gate } from "./gate";
import { AskTellApp } from "./ask-tell-app";
import { HomeFeed } from "./home-feed";

// Server Component (no "use client") so it can check the access cookie
// before anything renders — the gated app never even reaches the browser
// unless the cookie's already valid.
export default function Home() {
  if (!isUnlocked()) return <Gate />;
  return <AskTellApp feed={<HomeFeed />} />;
}
