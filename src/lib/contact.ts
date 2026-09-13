/**
 * Support channels, in one place because three surfaces render them: the
 * footer, /contact and the ContactPage structured data. Two copies of an
 * address is how one of them ends up stale.
 */

export const SUPPORT_EMAIL = "hello@scholarscrib.com";

/**
 * Digits only, international format without the "+" — e.g. "2348012345678".
 *
 * Deliberately empty until a real line exists. Consumers must treat a null
 * from whatsappHref() as "do not render the channel" rather than falling back
 * to a placeholder: a support route that goes nowhere costs more trust than an
 * absent one, and a student who messages it and hears nothing does not come
 * back to try email.
 */
export const WHATSAPP_NUMBER = "";

export const SUPPORT_HOURS = "Monday to Saturday, 9am – 6pm WAT";
export const SUPPORT_RESPONSE = "within one working day";

export function whatsappHref(): string | null {
  const digits = WHATSAPP_NUMBER.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/**
 * A subject line is not decoration here: it is what lets a one-person inbox
 * sort a billing problem from a school enquiry without opening either.
 */
export function mailtoHref(subject?: string): string {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
}
