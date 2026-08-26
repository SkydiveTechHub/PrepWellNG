import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireOwnerApi } from "@/lib/admin-session";
import { normalizeIdentifier } from "@/lib/admin-access";
import { recordAudit } from "@/lib/admin-audit";
import { createAdminSchema } from "@/lib/validators";
import { createAdmin, listAdmins } from "@/lib/admin-team";

export const dynamic = "force-dynamic";

const BCRYPT_ROUNDS = 12;

export async function GET() {
  const guard = await requireOwnerApi();
  if (!guard.ok) return guard.response;

  const admins = await listAdmins();

  return NextResponse.json({ admins });
}

export async function POST(req: NextRequest) {
  const guard = await requireOwnerApi();
  if (!guard.ok) return guard.response;

  const parsed = createAdminSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const identifier = normalizeIdentifier(parsed.data.identifier);
  if (!identifier) {
    return NextResponse.json(
      {
        error:
          "Enter a valid email, or a username of 3-32 characters using a-z, 0-9, dot, dash or underscore.",
      },
      { status: 400 },
    );
  }

  try {
    const admin = await createAdmin(
      identifier,
      await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
      guard.actor.id,
    );

    await recordAudit({
      actorId: guard.actor.id,
      action: "admin.create",
      entity: "Admin",
      entityId: admin.id,
      summary: `Created admin ${admin.email ?? admin.username}`,
    });

    return NextResponse.json({ admin }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That email or username is already taken" },
        { status: 409 },
      );
    }
    throw error;
  }
}
