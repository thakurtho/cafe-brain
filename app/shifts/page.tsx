import { isUnlocked } from "@/lib/access";
import { Gate } from "../gate";
import { ShiftsApp } from "./shifts-app";
import { getShiftsPageData } from "./data";

export default async function ShiftsPage() {
  if (!isUnlocked()) return <Gate />;
  const { people, requests } = await getShiftsPageData();
  return <ShiftsApp people={people} requests={requests} />;
}
