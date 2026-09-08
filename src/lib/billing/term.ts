/**
 * When a paid term starts and ends.
 *
 * Database-free on purpose — see the note at the top of `subscription.ts`.
 * All arithmetic is UTC: local-time helpers drift by a day across the West
 * Africa offset, which shows up as subscriptions expiring on the wrong date.
 */

import type { BillingPeriod } from "@/lib/subscription";

/**
 * Calendar-month addition that clamps rather than overflows.
 *
 * `setUTCMonth` alone turns Jan 31 + 1 month into Mar 3, which would hand a
 * subscriber three free days every time they bought on a long month.
 */
export function addMonthsUTC(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const result = new Date(date.getTime());

  // Move to the 1st first, so the month shift can never overflow, then clamp
  // the day back to whatever the destination month actually has.
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const daysInTarget = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(day, daysInTarget));
  return result;
}

/**
 * Where a newly purchased term begins.
 *
 * Stacking: if the buyer still has time left, the new term begins when the old
 * one ends. Paying twice extends the subscription and never overwrites it —
 * which is both what a user expects and what makes a duplicated charge
 * recoverable rather than costly.
 */
export function termStart(now: Date, currentEndsAt: Date | null): Date {
  if (currentEndsAt && currentEndsAt.getTime() > now.getTime()) {
    return new Date(currentEndsAt.getTime());
  }
  return new Date(now.getTime());
}

export function termEnd(start: Date, period: BillingPeriod): Date {
  return addMonthsUTC(start, period === "YEARLY" ? 12 : 1);
}
