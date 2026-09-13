import { isUnlocked } from "@/lib/access";
import { Gate } from "../gate";
import { TasksApp } from "./tasks-app";
import { getTasksPageData } from "./data";

export default async function TasksPage() {
  if (!isUnlocked()) return <Gate />;

  const { people, tasks, suggestions } = await getTasksPageData();
  return <TasksApp people={people} tasks={tasks} suggestions={suggestions} />;
}
