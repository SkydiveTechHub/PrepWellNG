import { randomUUID } from "node:crypto";

/**
 * A transaction reference. Prefixed so Paystack dashboard searches and log
 * greps can tell our references apart from ones Paystack generates itself.
 *
 * The randomness source is injectable purely so a caller can make it
 * deterministic; nothing in the app passes it.
 */
export function newReference(random: () => string = randomUUID): string {
  return `pw_${random().replace(/-/g, "")}`;
}
