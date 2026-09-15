// Announcement input validation. Pure. The SQL/DB side lives in
// announcement-data.ts.

import { z } from "zod";
import { audienceFilterSchema } from "@/lib/push-audience";
import { BODY_MAX, TITLE_MAX, isInternalPath } from "@/lib/push-payload";

const urlField = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isInternalPath(value), "Link must be a page on ScholarsCrib, e.g. /practice");

const messageFields = {
  title: z.string().trim().min(1).max(TITLE_MAX),
  body: z.string().trim().min(1).max(BODY_MAX),
  url: urlField,
};

export const announcementInputSchema = z.object({
  ...messageFields,
  audience: audienceFilterSchema,
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const testSendSchema = z.object({
  ...messageFields,
  contact: z.string().trim().min(1).max(200),
});

export const CONFIRM_TYPED_THRESHOLD = 500;

export function needsTypedConfirm(devices: number): boolean {
  return devices >= CONFIRM_TYPED_THRESHOLD;
}

export function expiresAtFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
