"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LuArrowRight, LuMenu, LuX } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "./logo";

const NAV_LINKS = [
  { name: "Features", href: "#features" },
  { name: "Product", href: "#product" },
  { name: "Subjects", href: "#subjects" },
  { name: "Pricing", href: "#pricing" },
  { name: "FAQ", href: "#faq" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b hairline transition-all duration-300",
        scrolled ? "glass-strong" : "glass",
      )}
    >
      <div className="landing-container flex h-16 items-center justify-between">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold ink-muted transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.name}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={buttonClass("ghost", "md", "hidden sm:inline-flex")}
          >
            Log in
          </Link>
          <Link
            href="/register"
            className={buttonClass("primary", "md", "btn-shine")}
          >
            Start free
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border hairline surface text-foreground transition-colors hover:bg-secondary md:hidden"
          >
            {open ? <LuX className="h-5 w-5" /> : <LuMenu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t hairline md:hidden">
          <div className="landing-container flex flex-col gap-1 py-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold ink transition-colors hover:bg-secondary"
              >
                {link.name}
                <LuArrowRight className="h-4 w-4 ink-faint" />
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t hairline pt-4">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className={buttonClass("outline", "md", "w-full")}
              >
                Log in
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className={buttonClass("primary", "md", "btn-shine w-full")}
              >
                Start free
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
