import {
  LuHouse,
  LuBookOpen,
  LuBook,
  LuClipboardCheck,
  LuCalendar,
  LuChartBar,
  LuAward,
  LuSettings,
  LuGraduationCap,
  LuSparkles,
} from "react-icons/lu";

export const NAV_GROUPS = [
  {
    label: "Study",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LuHouse },
      { name: "Subjects", href: "/subjects", icon: LuBookOpen },
      { name: "Flashcards", href: "/flashcards", icon: LuSparkles },
      { name: "Library", href: "/library", icon: LuBook },
    ],
  },
  {
    label: "Practice",
    items: [
      { name: "Practice", href: "/practice", icon: LuClipboardCheck },
      { name: "Study Plan", href: "/study-plan", icon: LuCalendar },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Performance", href: "/performance", icon: LuChartBar },
      { name: "Achievements", href: "/achievements", icon: LuAward },
    ],
  },
] as const;

export const SETTINGS_ITEM = {
  name: "Settings",
  href: "/settings",
  icon: LuSettings,
} as const;

export const BRAND = {
  name: "PrepWell",
  tagline: "WAEC · JAMB · NECO",
  icon: LuGraduationCap,
} as const;

/** Static target used until a per-student exam date exists. */
export const EXAM_TARGET = {
  label: "WAEC 2027",
  date: new Date("2027-05-03T09:00:00"),
} as const;

export function daysUntil(date: Date): number {
  const now = new Date();
  const ms = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
