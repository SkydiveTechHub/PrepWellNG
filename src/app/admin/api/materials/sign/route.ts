import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { signUpload } from "@/lib/cloudinary";
import { requiresUpload, signingParamsFor } from "@/lib/admin-material";
import { isMaterialType } from "@/lib/materials";

export const dynamic = "force-dynamic";

// POST /admin/api/materials/sign — authorise one direct-to-Cloudinary upload.
//
// The signature covers the folder and the format allowlist, so a caller cannot
// widen either after we have signed them.
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const body = (await req.json()) as { type?: unknown };
    const type = typeof body.type === "string" ? body.type : "";

    if (!isMaterialType(type)) {
      return NextResponse.json({ error: "Unknown material type" }, { status: 400 });
    }

    if (!requiresUpload(type)) {
      return NextResponse.json(
        { error: `${type} materials carry a URL, not a file` },
        { status: 400 },
      );
    }

    const params = signingParamsFor(type);
    const signed = signUpload({
      folder: params.folder,
      allowed_formats: params.allowedFormats.join(","),
    });

    if (!signed) {
      return NextResponse.json(
        {
          error:
            "File uploads aren't configured. Add your Cloudinary credentials to .env.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      cloudName: signed.cloudName,
      apiKey: signed.apiKey,
      timestamp: signed.timestamp,
      signature: signed.signature,
      folder: params.folder,
      allowedFormats: params.allowedFormats,
      maxBytes: params.maxBytes,
      resourceType: params.resourceType,
    });
  } catch (error) {
    console.error("Error signing material upload:", error);
    return NextResponse.json({ error: "Failed to sign upload" }, { status: 500 });
  }
}
