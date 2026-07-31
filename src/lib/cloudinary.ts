import crypto from "crypto";

// The .env template ships these as literal placeholders. Treat an unedited
// placeholder as "not configured" so uploads fail with a clear message instead
// of a confusing 401 from a Cloudinary account that doesn't exist.
const PLACEHOLDERS = ["your-cloud-name", "your-api-key", "your-api-secret"];

function credentials() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return null;
  if ([cloudName, apiKey, apiSecret].some((v) => PLACEHOLDERS.includes(v))) {
    return null;
  }

  return { cloudName, apiKey, apiSecret };
}

export function isImageUploadConfigured() {
  return credentials() !== null;
}

/** Thrown when Cloudinary refuses the upload. `blameCaller` marks the cases
 *  where the file was at fault rather than the service. */
export class UploadRejectedError extends Error {
  constructor(
    message: string,
    readonly blameCaller: boolean,
  ) {
    super(message);
    this.name = "UploadRejectedError";
  }
}

/**
 * Upload an image to Cloudinary using a signed request and return its secure
 * URL. Signed uploads need no preset configuration on the Cloudinary side.
 */
export async function uploadAvatar(file: File, userId: string) {
  const creds = credentials();
  if (!creds) throw new Error("Image uploads aren't configured");

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "prepwell/avatars";
  // One asset per user, overwritten on each upload, so old avatars don't
  // accumulate in the account.
  const publicId = `${folder}/${userId}`;

  // Cloudinary signs the alphabetically sorted, &-joined parameter string.
  const toSign = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(toSign + creds.apiSecret)
    .digest("hex");

  const body = new FormData();
  body.append("file", file);
  body.append("api_key", creds.apiKey);
  body.append("timestamp", String(timestamp));
  body.append("public_id", publicId);
  body.append("overwrite", "true");
  body.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/upload`,
    { method: "POST", body },
  );

  if (!res.ok) {
    // A 4xx means the file itself was unacceptable (corrupt, not really an
    // image, too large for the plan). That's the caller's problem to fix, so
    // surface Cloudinary's own reason rather than a generic server error.
    const detail = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const reason = detail?.error?.message ?? "Cloudinary rejected the image";

    throw new UploadRejectedError(reason, res.status < 500);
  }

  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary returned no image URL");

  return json.secure_url;
}
