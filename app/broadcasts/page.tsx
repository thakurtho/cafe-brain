import { isUnlocked } from "@/lib/access";
import { Gate } from "../gate";
import { BroadcastsApp } from "./broadcasts-app";
import { getBroadcastsPageData } from "./data";

export default async function BroadcastsPage() {
  if (!isUnlocked()) return <Gate />;
  const { people, broadcasts } = await getBroadcastsPageData();
  return <BroadcastsApp people={people} broadcasts={broadcasts} />;
}
