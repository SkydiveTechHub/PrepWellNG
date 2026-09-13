import { db } from "@/lib/db";
import { nextOrderIndex } from "@/lib/admin-material";
import type { MaterialCreateInput, MaterialUpdateInput } from "@/lib/validators";

/**
 * Every database read and write for library materials. No HTTP, no auth — the
 * routes own those, the way `admin-question-data.ts` is arranged.
 */

/** Subjects for the console's subject picker. */
export async function listMaterialSubjects() {
  return db.subject.findMany({
    orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      trackCategory: true,
      _count: { select: { resources: true } },
    },
  });
}

export async function listMaterials(subjectId: string) {
  return db.subjectResource.findMany({
    where: { subjectId },
    orderBy: [{ orderIndex: "asc" }, { title: "asc" }],
  });
}

export async function createMaterial(input: MaterialCreateInput) {
  const existing = await db.subjectResource.findMany({
    where: { subjectId: input.subjectId },
    select: { orderIndex: true },
  });

  return db.subjectResource.create({
    data: {
      subjectId: input.subjectId,
      title: input.title,
      description: input.description || null,
      resourceType: input.resourceType,
      url: input.url,
      author: input.author || null,
      isFree: input.isFree,
      orderIndex: nextOrderIndex(existing),
    },
  });
}

export async function getMaterial(id: string) {
  return db.subjectResource.findUnique({ where: { id } });
}

export async function updateMaterial(id: string, input: MaterialUpdateInput) {
  return db.subjectResource.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && {
        description: input.description || null,
      }),
      ...(input.resourceType !== undefined && { resourceType: input.resourceType }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.author !== undefined && { author: input.author || null }),
      ...(input.isFree !== undefined && { isFree: input.isFree }),
      ...(input.orderIndex !== undefined && { orderIndex: input.orderIndex }),
    },
  });
}

export async function deleteMaterial(id: string) {
  return db.subjectResource.delete({ where: { id } });
}
