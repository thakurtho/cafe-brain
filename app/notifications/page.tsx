import { isUnlocked } from "@/lib/access";
import { Gate } from "../gate";
import { NotificationsApp } from "./notifications-app";
import { getNotificationsPageData } from "./data";

export default async function NotificationsPage() {
  if (!isUnlocked()) return <Gate />;
  const data = await getNotificationsPageData();
  return <NotificationsApp {...data} />;
}
