"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";
import { MATERIAL_TYPES, MATERIAL_LABELS, type MaterialType } from "@/lib/materials";
import { requiresUpload } from "@/lib/admin-material";

export type MaterialRow = {
  id: string;
  title: string;
  description: string | null;
  resourceType: MaterialType;
  url: string;
  author: string | null;
  isFree: boolean;
  orderIndex: number;
};

type Props = {
  subjectId: string;
  /** Absent when adding. */
  material?: MaterialRow;
  onSaved: () => void;
  onCancel: () => void;
};

type Signature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string[];
  maxBytes: number;
  resourceType: "image" | "raw";
};

export function MaterialForm({ subjectId, material, onSaved, onCancel }: Props) {
  const fieldId = useId();
  const [type, setType] = useState<MaterialType>(material?.resourceType ?? "PDF");
  const [title, setTitle] = useState(material?.title ?? "");
  const [description, setDescription] = useState(material?.description ?? "");
  const [author, setAuthor] = useState(material?.author ?? "");
  const [url, setUrl] = useState(material?.url ?? "");
  const [isFree, setIsFree] = useState(material?.isFree ?? true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = requiresUpload(type);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      // Ask the server to authorise this one upload. The signature covers the
      // folder and the format allowlist, so the browser cannot widen either.
      const signRes = await fetch("/admin/api/materials/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const signed = (await signRes.json()) as Signature & { error?: string };
      if (!signRes.ok) throw new Error(signed.error ?? "Could not start the upload");

      // maxBytes is advisory only — Cloudinary does not enforce it from this
      // signature. This guard just saves the round trip on an obvious miss.
      if (file.size > signed.maxBytes) {
        throw new Error(
          `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${
            signed.maxBytes / 1024 / 1024
          }MB.`,
        );
      }

      const body = new FormData();
      body.append("file", file);
      body.append("api_key", signed.apiKey);
      body.append("timestamp", String(signed.timestamp));
      body.append("folder", signed.folder);
      // Joined with a plain comma, no spaces — the server signed the string
      // this way, and any other delimiter breaks the signature.
      body.append("allowed_formats", signed.allowedFormats.join(","));
      body.append("signature", signed.signature);

      // Straight to Cloudinary: a serverless deploy caps request bodies at
      // about 4.5MB, which no textbook fits inside.
      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${signed.cloudName}/${signed.resourceType}/upload`,
        { method: "POST", body },
      );
      const json = (await uploadRes.json()) as {
        secure_url?: string;
        error?: { message?: string };
      };
      if (!uploadRes.ok || !json.secure_url) {
        throw new Error(json.error?.message ?? "Cloudinary rejected the file");
      }

      setUrl(json.secure_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        title,
        description,
        resourceType: type,
        url,
        author,
        isFree,
      };

      const res = material
        ? await fetch(`/admin/api/materials/${material.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/admin/api/materials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, subjectId }),
          });

      const json = (await res.json()) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!res.ok) {
        const fieldError = Object.values(json.details?.fieldErrors ?? {})[0]?.[0];
        throw new Error(fieldError ?? json.error ?? "Could not save this material");
      }

      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-5">
      {error && <StatusBanner tone="error" title="Could not save this material" message={error} />}

      <div>
        <label htmlFor={`${fieldId}-type`} className="block text-sm font-semibold text-foreground">
          Type
        </label>
        <select
          id={`${fieldId}-type`}
          value={type}
          onChange={(event) => {
            // Switching between an uploaded and a pasted type invalidates the
            // URL either way, so clear it rather than carry a stale one over.
            setType(event.target.value as MaterialType);
            setUrl("");
          }}
          className="mt-2 block w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
        >
          {MATERIAL_TYPES.map((value) => (
            <option key={value} value={value}>
              {MATERIAL_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${fieldId}-title`} className="block text-sm font-semibold text-foreground">
          Title
        </label>
        <input
          id={`${fieldId}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          minLength={2}
          className="mt-2 block w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor={`${fieldId}-description`} className="block text-sm font-semibold text-foreground">
          Description <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id={`${fieldId}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={600}
          className="mt-2 block w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor={`${fieldId}-author`} className="block text-sm font-semibold text-foreground">
          Author <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={`${fieldId}-author`}
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          className="mt-2 block w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
        />
      </div>

      {upload ? (
        <div>
          <label htmlFor={`${fieldId}-file`} className="block text-sm font-semibold text-foreground">
            {MATERIAL_LABELS[type]} file
          </label>
          <input
            id={`${fieldId}-file`}
            type="file"
            accept={type === "PDF" ? "application/pdf" : "image/*"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="mt-2 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-border"
          />
          {uploading && <p className="mt-1.5 text-xs text-muted">Uploading…</p>}
          {url && !uploading && (
            <p className="mt-1.5 truncate text-xs text-muted">Uploaded: {url}</p>
          )}
          {type === "PDF" && (
            <p className="mt-2 text-xs text-muted">
              Cloudinary blocks PDF delivery by default. If an uploaded PDF will
              not open, enable Settings → Security → &ldquo;PDF and ZIP files
              delivery&rdquo; in the Cloudinary dashboard.
            </p>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor={`${fieldId}-url`} className="block text-sm font-semibold text-foreground">
            {type === "VIDEO" ? "YouTube or Vimeo URL" : "URL"}
          </label>
          <input
            id={`${fieldId}-url`}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            required
            className="mt-2 block w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
          />
          {type === "VIDEO" && (
            <p className="mt-1.5 text-xs text-muted">
              A hosted embed, not a direct video file — it gives students
              adaptive quality on slow connections.
            </p>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          className="mt-0.5 flex-shrink-0"
          type="checkbox"
          checked={!isFree}
          onChange={(event) => setIsFree(!event.target.checked)}
        />
        Premium — listed to everyone, opens only for subscribers
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={saving || uploading || !url}>
          {saving ? "Saving…" : material ? "Save changes" : "Add material"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
