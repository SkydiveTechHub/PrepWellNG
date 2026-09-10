import type { MaterialType } from "./materials";

/**
 * The rules governing a library material, as pure functions.
 *
 * Database-free so they can be unit tested the way `admin-access.ts` is. The
 * database work lives in `admin-material-data.ts`; keeping the two apart is
 * what makes these testable.
 */

/** PDFs and images are uploaded; videos and links carry a pasted URL. */
export function requiresUpload(type: MaterialType): boolean {
  return type === "PDF" || type === "IMAGE";
}

/**
 * Hosts we accept for a `VIDEO`.
 *
 * Self-hosting video would mean one fixed bitrate with no adaptive streaming —
 * the wrong trade on the metered mobile connections most of this audience is
 * on. An embed from one of these gives adaptive bitrate and a CDN for free.
 */
const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com"] as const;

function hostMatches(hostname: string, host: string): boolean {
  // Suffix match on a dot boundary, so `youtube.com.evil.test` does not pass
  // the way a plain `includes` would let it.
  return hostname === host || hostname.endsWith(`.${host}`);
}

export type UrlCheck = { ok: true } | { ok: false; reason: string };

export function validateMaterialUrl(type: MaterialType, url: string): UrlCheck {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Enter a full URL, starting with https://" };
  }

  // http would be blocked as mixed content in the student's browser, so an
  // http material is a material that silently fails to load.
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "The URL must start with https://" };
  }

  if (type === "VIDEO") {
    const hostname = parsed.hostname.replace(/^www\./, "");
    const known = VIDEO_HOSTS.some((host) => hostMatches(hostname, host));
    if (!known) {
      return {
        ok: false,
        reason: "Video must be a YouTube or Vimeo link, not a direct video file",
      };
    }
  }

  return { ok: true };
}

export type SigningParams = {
  folder: string;
  allowedFormats: string[];
  maxBytes: number;
  /** Cloudinary's upload endpoint segment. A PDF is a raw asset, not an image. */
  resourceType: "image" | "raw";
};

export function signingParamsFor(type: MaterialType): SigningParams {
  if (type === "PDF") {
    return {
      folder: "prepwell/materials/pdf",
      allowedFormats: ["pdf"],
      maxBytes: 50 * 1024 * 1024,
      resourceType: "raw",
    };
  }
  if (type === "IMAGE") {
    return {
      folder: "prepwell/materials/image",
      allowedFormats: ["jpg", "jpeg", "png", "webp"],
      maxBytes: 5 * 1024 * 1024,
      resourceType: "image",
    };
  }
  // VIDEO and LINK carry a pasted URL and never reach the signing route; the
  // route rejects them before calling this.
  throw new Error(`${type} materials are not uploaded`);
}

/** Where a newly added material lands: after the last one, gaps and all. */
export function nextOrderIndex(
  existing: readonly { orderIndex: number }[],
): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((row) => row.orderIndex)) + 1;
}
