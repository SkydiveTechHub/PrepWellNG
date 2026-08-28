import Link from "next/link";
import { LuChevronLeft } from "react-icons/lu";

/**
 * Chrome for a single-record page: where you came from, what you are looking
 * at, what you can do to it.
 */
export function DetailShell({
  breadcrumb,
  title,
  subtitle,
  actions,
  children,
}: {
  breadcrumb: { label: string; href: string };
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Link
        href={breadcrumb.href}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <LuChevronLeft className="h-4 w-4" />
        {breadcrumb.label}
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>

      <div className="flex flex-col gap-8">{children}</div>
    </div>
  );
}
