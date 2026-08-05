"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LuArrowRight,
  LuBookOpen,
  LuClock,
  LuRotateCcw,
} from "react-icons/lu";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COOLDOWN_MS = 30 * 60 * 1000;

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Live cooldown for a failed practice attempt: disables retry for 30 minutes
 * and shows when it unlocks. Time reads live in interval callbacks so the
 * component stays pure during render.
 */
export function PracticeResultActions({
  passed,
  completedAt,
  practiceHref,
  lessonHref,
  topicHref,
  subjectSlug,
  topicSlug,
}: {
  passed: boolean;
  completedAt: Date | null;
  practiceHref: string;
  lessonHref: string;
  topicHref: string;
  subjectSlug: string;
  topicSlug: string;
}) {
  const [cooldownActive, setCooldownActive] = useState(false);
  const [retryAt, setRetryAt] = useState<Date | null>(null);

  useEffect(() => {
    const check = () => {
      const base = completedAt ? new Date(completedAt) : new Date();
      const next = new Date(base.getTime() + COOLDOWN_MS);
      setRetryAt(next);
      setCooldownActive(next.getTime() > Date.now());
    };
    const timeoutId = window.setTimeout(check, 0);
    const intervalId = window.setInterval(check, 30000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [completedAt]);

  const quizHref = `/classroom/${subjectSlug}/${topicSlug}/quiz`;

  return (
    <>
      {!passed && cooldownActive && retryAt && (
        <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          <LuClock className="h-4 w-4 flex-shrink-0" />
          Retry available at {formatTime(retryAt)} (30-minute cooldown)
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={topicHref} className={buttonClass("primary", "md")}>
          Back to topic
          <LuArrowRight className="h-4 w-4" />
        </Link>
        <Link href={lessonHref} className={buttonClass("secondary", "md")}>
          <LuBookOpen className="h-4 w-4" />
          Review lesson cards
        </Link>
        {passed ? (
          <Link href={quizHref} className={buttonClass("success", "md")}>
            Take the topic quiz
            <LuArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link
            href={practiceHref}
            aria-disabled={cooldownActive}
            className={cn(
              buttonClass("success", "md"),
              cooldownActive && "pointer-events-none opacity-50",
            )}
          >
            <LuRotateCcw className="h-4 w-4" />
            Retry practice test
          </Link>
        )}
      </div>
    </>
  );
}
