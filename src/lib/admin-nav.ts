import {
  LuBookOpen,
  LuDatabase,
  LuLayoutDashboard,
  LuUpload,
  LuUsers,
} from "react-icons/lu";
import type { IconType } from "react-icons";

type AdminNavItem = {
  name: string;
  href: string;
  icon: IconType;
  /** Hidden from non-owners. The page and its routes also enforce this. */
  ownerOnly?: boolean;
};

// Every entry must have a page behind it. An earlier version listed Subjects,
// Users and Lessons with no routes — three links straight to a 404.
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { name: "Overview", href: "/admin", icon: LuLayoutDashboard },
  { name: "Questions", href: "/admin/questions", icon: LuDatabase },
  { name: "Import", href: "/admin/questions/import", icon: LuUpload },
  { name: "Lessons", href: "/admin/lessons", icon: LuBookOpen },
  { name: "Team", href: "/admin/team", icon: LuUsers, ownerOnly: true },
];
