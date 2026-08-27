import { requireAdminPage } from "@/lib/admin-session";
import { QuestionsClient } from "./questions-client";

export default async function QuestionsPage() {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own. QuestionsClient uses hooks and
  // cannot await the guard itself, hence this server wrapper.
  await requireAdminPage();
  return <QuestionsClient />;
}
