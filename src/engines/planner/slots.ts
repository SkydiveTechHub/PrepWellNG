import { addDays, isoWeekday, isWeekend, mondayOf, type DayKey } from "./days";

export type Availability = {
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  studyDays: readonly number[];
  weekdayMinutes: number;
  weekendMinutes: number;
};

export type Slot = {
  date: DayKey;
  minutes: number;
  /** 15–29 minutes: only revision fits. */
  short: boolean;
  /** Reserved for missed work first. */
  catchUp: boolean;
};

export const SESSION_MINUTES = 30;
export const SHORT_SESSION_MIN = 15;

export function dayBudget(date: DayKey, availability: Availability): number {
  if (!availability.studyDays.includes(isoWeekday(date))) return 0;
  return isWeekend(date) ? availability.weekendMinutes : availability.weekdayMinutes;
}

/** Splits each study day's budget into sessions. Never schedules more than the budget. */
export function buildSlots(start: DayKey, days: number, availability: Availability): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const budget = dayBudget(date, availability);
    const full = Math.floor(budget / SESSION_MINUTES);
    for (let s = 0; s < full; s++) {
      slots.push({ date, minutes: SESSION_MINUTES, short: false, catchUp: false });
    }
    const rest = budget - full * SESSION_MINUTES;
    if (rest >= SHORT_SESSION_MIN) {
      slots.push({ date, minutes: rest, short: true, catchUp: false });
    }
  }

  // Slots are date-ordered, so the last write per week is its last study day.
  const lastDayOfWeek = new Map<DayKey, DayKey>();
  for (const slot of slots) {
    if (!slot.short) lastDayOfWeek.set(mondayOf(slot.date), slot.date);
  }
  for (const date of lastDayOfWeek.values()) {
    const first = slots.find((s) => s.date === date && !s.short);
    if (first) first.catchUp = true;
  }
  return slots;
}
