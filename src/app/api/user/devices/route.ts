import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revokeDevice, revokeOtherDevices } from "@/lib/devices";

export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ deviceId: z.string().min(1) }),
  z.object({ allOthers: z.literal(true) }),
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const currentDeviceId = (session.user as { deviceId?: string }).deviceId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    if ("allOthers" in parsed.data) {
      const revoked = await revokeOtherDevices(userId, currentDeviceId);
      return NextResponse.json({ revoked });
    }

    // Signing out this device is the ordinary sign-out button's job.
    if (parsed.data.deviceId === currentDeviceId) {
      return NextResponse.json(
        { error: "Use Sign out to leave this device" },
        { status: 400 },
      );
    }

    const ok = await revokeDevice(userId, parsed.data.deviceId);
    if (!ok) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }
    return NextResponse.json({ revoked: 1 });
  } catch (error) {
    console.error("Device sign-out failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
