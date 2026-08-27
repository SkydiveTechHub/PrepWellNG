import { requireAdminPage } from "@/lib/admin-session";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own. ImportClient uses hooks and cannot
  // await the guard itself, hence this server wrapper.
  await requireAdminPage();
  return <ImportClient />;
}
