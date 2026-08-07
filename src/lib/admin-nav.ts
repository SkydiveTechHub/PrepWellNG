import { LuBookOpen, LuDatabase, LuLayoutDashboard, LuUpload } from "react-icons/lu";

// Every entry must have a page behind it. An earlier version listed Subjects,
// Users and Lessons with no routes — three links straight to a 404.
export const ADMIN_NAV = [
  { name: "Overview", href: "/admin", icon: LuLayoutDashboard },
  { name: "Questions", href: "/admin/questions", icon: LuDatabase },
  { name: "Import", href: "/admin/questions/import", icon: LuUpload },
  { name: "Lessons", href: "/admin/lessons", icon: LuBookOpen },
] as const;
