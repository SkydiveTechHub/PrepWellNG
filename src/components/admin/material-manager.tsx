"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTable, AdminTd, AdminTh, AdminTr } from "@/components/admin/admin-table";
import { EmptyState } from "@/components/admin/empty-state";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MATERIAL_LABELS } from "@/lib/materials";
import { MaterialForm, type MaterialRow } from "@/components/admin/material-form";

type SubjectOption = {
  id: string;
  name: string;
  code: string;
  trackCategory: string;
  _count: { resources: number };
};

export function MaterialManager({
  subjects,
  selectedSubjectId,
  materials,
}: {
  subjects: SubjectOption[];
  selectedSubjectId: string | null;
  materials: MaterialRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function selectSubject(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("subjectId", id);
    else params.delete("subjectId");
    router.push(`/admin/library?${params.toString()}`);
  }

  function done() {
    setAdding(false);
    setEditing(null);
    router.refresh();
  }

  async function move(material: MaterialRow, direction: -1 | 1) {
    const ordered = [...materials].sort((a, b) => a.orderIndex - b.orderIndex);
    const index = ordered.findIndex((row) => row.id === material.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;

    // Normally swapping the two indexes reorders them. But if two rows were
    // created in a race and ended up sharing the same orderIndex, swapping
    // equal values is a no-op — nudge the moving row's index to the correct
    // side of its neighbour instead, so the move actually takes effect.
    const tied = swapWith.orderIndex === material.orderIndex;
    const materialNewIndex = tied ? swapWith.orderIndex + direction : swapWith.orderIndex;

    // Sequential, not parallel: two PATCHes racing on adjacent rows can
    // interleave and leave both holding the same index.
    await fetch(`/admin/api/materials/${material.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIndex: materialNewIndex }),
    });
    await fetch(`/admin/api/materials/${swapWith.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIndex: material.orderIndex }),
    });
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await fetch(`/admin/api/materials/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  const ordered = [...materials].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="material-subject" className="block text-sm font-semibold text-foreground">
          Subject
        </label>
        <select
          id="material-subject"
          value={selectedSubjectId ?? ""}
          onChange={(event) => selectSubject(event.target.value)}
          className="mt-2 block w-full max-w-sm rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
        >
          <option value="">Choose a subject…</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name} ({subject._count.resources})
            </option>
          ))}
        </select>
      </div>

      {!selectedSubjectId ? (
        <EmptyState
          title="Choose a subject"
          message="Pick a subject above to see and manage its materials."
        />
      ) : (
        <>
          {!adding && !editing && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add material
            </Button>
          )}

          {(adding || editing) && (
            <MaterialForm
              subjectId={selectedSubjectId}
              material={editing ?? undefined}
              onSaved={done}
              onCancel={done}
            />
          )}

          {ordered.length === 0 ? (
            <EmptyState
              title="No materials yet"
              message="Nothing is filed under this subject. Add the first one above."
            />
          ) : (
            <AdminTable caption="Materials filed under this subject">
              <thead>
                <AdminTr>
                  <AdminTh>Title</AdminTh>
                  <AdminTh>Type</AdminTh>
                  <AdminTh>Access</AdminTh>
                  <AdminTh align="right">Order</AdminTh>
                  <AdminTh align="right">Actions</AdminTh>
                </AdminTr>
              </thead>
              <tbody>
                {ordered.map((material, index) => (
                  <AdminTr key={material.id}>
                    <AdminTd className="font-medium text-foreground">{material.title}</AdminTd>
                    <AdminTd className="text-muted">{MATERIAL_LABELS[material.resourceType]}</AdminTd>
                    <AdminTd>
                      {material.isFree ? (
                        <Badge variant="neutral">Free</Badge>
                      ) : (
                        <Badge variant="amber">Premium</Badge>
                      )}
                    </AdminTd>
                    <AdminTd align="right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Move "${material.title}" up`}
                          disabled={index === 0}
                          onClick={() => void move(material, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Move "${material.title}" down`}
                          disabled={index === ordered.length - 1}
                          onClick={() => void move(material, 1)}
                        >
                          ↓
                        </Button>
                      </div>
                    </AdminTd>
                    <AdminTd align="right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(material)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleting(material)}
                        >
                          Delete
                        </Button>
                      </div>
                    </AdminTd>
                  </AdminTr>
                ))}
              </tbody>
            </AdminTable>
          )}
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this material?"
        description={
          deleting
            ? `"${deleting.title}" will disappear from the student shelf. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
