import Link from "next/link";
import { LuGraduationCap } from "react-icons/lu";
import { UserMenu, type ProfileUser } from "./user-menu";

/** Mobile-only top bar. Desktop gets the same actions from the sidebar footer. */
export function MobileHeader({ user }: { user: ProfileUser }) {
  return (
    <header className="lg:hidden sticky top-0 z-40 bg-card border-b border-border">
      <div className="flex items-center justify-between px-4 h-14">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <LuGraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-base font-bold text-foreground tracking-tight">
            PrepWell
          </span>
        </Link>

        <UserMenu user={user} align="right" />
      </div>
    </header>
  );
}
