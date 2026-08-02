import { PrismaClient } from "@prisma/client";
import { seedLessons } from "../src/lib/lessons";

// Idempotent — safe to run multiple times. Seeds one auto-generated lesson
// per topic (plus the "Core Concepts" subtopic each lesson hangs off).
// Much faster than a full `prisma db seed` on an already-populated database.

const prisma = new PrismaClient();

seedLessons(prisma)
  .then(() => console.log("\n✅ Lessons seeded successfully!"))
  .catch((e) => {
    console.error("Lesson seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
