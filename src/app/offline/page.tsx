import Link from "next/link";
import type { Metadata } from "next";
import { LuWifiOff } from "react-icons/lu";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "You're offline",
  description: "ScholarsCrib could not reach the network.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted">
        <LuWifiOff className="h-6 w-6" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          You&apos;re offline
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
          This page needs a connection. Lessons and past questions you&apos;ve
          already opened will still load.
        </p>
      </div>
      <Link href="/" className={buttonClass("primary", "md")}>
        Try again
      </Link>
    </main>
  );
}
