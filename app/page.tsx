import { isUnlocked } from "@/lib/access";
import { Gate } from "./gate";
import { AskTellApp } from "./ask-tell-app";

// Server Component (no "use client") so it can check the access cookie
// before anything renders — the gated app never even reaches the browser
// unless the cookie's already valid.
export default function Home() {
  return isUnlocked() ? <AskTellApp /> : <Gate />;
}
