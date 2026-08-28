import {
  LuBookOpen,
  LuDatabase,
  LuGraduationCap,
  LuLayoutDashboard,
  LuScrollText,
  LuUsers,
} from "react-icons/lu";
import type { IconType } from "react-icons";

export type AdminNavItem = {
  name: string;
  href: string;
  icon: IconType;
  /** Hidden from non-owners. The page and its routes also enforce this. */
  ownerOnly?: boolean;
};

export type AdminNavGroup = {
  label: string;
  items: readonly AdminNavItem[];
};

// Every entry must have a page behind it. An earlier version listed Subjects,
// Users and Lessons with no routes — three links straight to a 404. Curriculum
// and Billing are deliberately absent for the same reason.
//
// Import is not a top-level entry: it is an action inside Questions. The route
// /admin/questions/import is unchanged.
export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ name: "Dashboard", href: "/admin", icon: LuLayoutDashboard }],
  },
  {
    label: "Content",
    items: [
      { name: "Questions", href: "/admin/questions", icon: LuDatabase },
      { name: "Lessons", href: "/admin/lessons", icon: LuBookOpen },
    ],
  },
  {
    label: "People",
    items: [
      { name: "Students", href: "/admin/students", icon: LuGraduationCap },
      { name: "Team", href: "/admin/team", icon: LuUsers, ownerOnly: true },
    ],
  },
  {
    label: "System",
    items: [{ name: "Audit log", href: "/admin/audit", icon: LuScrollText }],
  },
];

// The three real routes on the mobile bar; the fourth slot is "More". Students
// takes Lessons' slot here — students are the higher-value mobile
// destination, and Lessons stays reachable through the "More" sheet. An href
// with no routed entry is skipped, so this list only ever names live routes.
export const MOBILE_NAV_HREFS: readonly string[] = [
  "/admin",
  "/admin/questions",
  "/admin/students",
];

function permitted(item: AdminNavItem, isOwner: boolean): boolean {
  return !item.ownerOnly || isOwner;
}

/**
 * Groups an actor may see, with empty groups dropped — a group label with
 * nothing under it reads as a broken section rather than an absent one.
 */
export function visibleGroups(isOwner: boolean): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => permitted(item, isOwner)),
  })).filter((group) => group.items.length > 0);
}

export function visibleItems(isOwner: boolean): AdminNavItem[] {
  return visibleGroups(isOwner).flatMap((group) => [...group.items]);
}

/**
 * The bar keeps a fixed shape whoever is looking, so the layout does not shift
 * between an owner and a regular admin. Entries not yet routed are skipped.
 */
export function mobileBarItems(isOwner: boolean): AdminNavItem[] {
  const items = visibleItems(isOwner);
  return MOBILE_NAV_HREFS.map((href) =>
    items.find((item) => item.href === href),
  ).filter((item): item is AdminNavItem => item !== undefined);
}

/** Everything the actor may see that the bar does not already show. */
export function moreSheetGroups(isOwner: boolean): AdminNavGroup[] {
  const onBar = new Set(mobileBarItems(isOwner).map((item) => item.href));
  return visibleGroups(isOwner)
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => !onBar.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}
