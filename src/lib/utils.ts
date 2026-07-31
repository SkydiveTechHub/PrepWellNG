import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

export function getGrade(percentage: number): {
  grade: string;
  remark: string;
  isCredit: boolean;
} {
  if (percentage >= 75)
    return { grade: "A1", remark: "Excellent", isCredit: true };
  if (percentage >= 70)
    return { grade: "B2", remark: "Very Good", isCredit: true };
  if (percentage >= 65)
    return { grade: "B3", remark: "Good", isCredit: true };
  if (percentage >= 60)
    return { grade: "C4", remark: "Credit", isCredit: true };
  if (percentage >= 55)
    return { grade: "C5", remark: "Credit", isCredit: true };
  if (percentage >= 50)
    return { grade: "C6", remark: "Credit", isCredit: true };
  if (percentage >= 45)
    return { grade: "D7", remark: "Pass", isCredit: false };
  if (percentage >= 40)
    return { grade: "E8", remark: "Pass", isCredit: false };
  return { grade: "F9", remark: "Fail", isCredit: false };
}

export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
