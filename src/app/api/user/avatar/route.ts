import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setUserAvatar } from "@/lib/user-account";
import {
  UploadRejectedError,
  isImageUploadConfigured,
  uploadAvatar,
} from "@/lib/cloudinary";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every accepted upload costs a Cloudinary transformation.
  const limit = rateLimit({
    key: `avatar:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  if (!isImageUploadConfigured()) {
    return NextResponse.json(
      {
        error:
          "Image uploads aren't configured. Add your Cloudinary credentials to .env.",
      },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: "Use a JPEG, PNG, or WebP image" },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be under 2MB" },
        { status: 400 },
      );
    }

    const image = await uploadAvatar(file, session.user.id);

    await setUserAvatar(session.user.id, image);

    return NextResponse.json({ message: "Photo updated", image });
  } catch (error) {
    if (error instanceof UploadRejectedError && error.blameCaller) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Avatar upload failed:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }
}
