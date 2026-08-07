"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { LessonNotes } from "@/components/classroom/lesson-notes";
import { validateLessonMarkdown, type ParsedLesson } from "@/lib/lesson-markdown";
import type { CheckBlock } from "@/lib/lesson-engine";

type TopicOption = {
  id: string;
  title: string;
  slug: string;
  curriculumLevel: { classLevel: string; term: string } | null;
};

type SubjectOption = {
  id: string;
  name: string;
  slug: string;
  topics: TopicOption[];
};

type Current = {
  topicTitle: string;
  lesson: { title: string; blockCount: number; authored: boolean } | null;
};

const SAMPLE = `---
title: Newton's First Law
estimatedMinutes: 20
---

## What the law says

An object stays at rest, or moves at constant velocity, unless a net
force acts on it.

:::example
Problem: A book rests on a table. Why does it not move?
Step: Identify the forces — weight down, normal force up.
Step: They are equal and opposite, so the net force is zero.
Answer: With zero net force, the book stays at rest.
:::

:::tip
Exam: WAEC
Say "net force", not "force" — the distinction earns the mark.
:::

:::check
Q: A car moves at constant velocity. What is the net force on it?
A) Zero
B) Equal to its weight
C) Equal to its momentum
Correct: A
Why: Constant velocity means no acceleration, so no net force.
:::`;

export function LessonUploadForm({
  subjects,
  initialTopicId,
}: {
  subjects: SubjectOption[];
  initialTopicId: string | null;
}) {
  const initialSubjectId =
    subjects.find((s) => s.topics.some((t) => t.id === initialTopicId))?.id ?? "";

  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [topicId, setTopicId] = useState(initialTopicId ?? "");
  const [markdown, setMarkdown] = useState("");
  const [current, setCurrent] = useState<Current | null>(null);
  const [currentStatus, setCurrentStatus] = useState<"idle" | "loading" | "loaded" | "failed">(
    "idle",
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fileInputId = useId();
  const subjectInputId = useId();
  const topicInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const topics = subject?.topics ?? [];

  // Parsed on every keystroke. The parser is a line scanner over one lesson —
  // cheap enough that debouncing would add a bug surface for no gain.
  const parsed: ParsedLesson | null = useMemo(
    () => (markdown.trim() ? validateLessonMarkdown(markdown) : null),
    [markdown],
  );

  const checks = (parsed?.blocks ?? []).filter(
    (b): b is CheckBlock => b.type === "check",
  );

  const canSave =
    Boolean(topicId) && parsed !== null && parsed.errors.length === 0 && !submitting;

  // Exactly one "what is currently stored" lookup may own the state at a time.
  // Without this, the mount fetch and a topic-select change can resolve out of
  // order and leave `currentStatus === "loaded"` paired with a `current` for a
  // *different* topic — which the confirm dialog would then state as fact,
  // naming the wrong topic and the wrong block count for an overwrite that is
  // unversioned and irreversible. Same shape as the AbortController in
  // src/app/admin/questions/page.tsx.
  const currentRequestRef = useRef<AbortController | null>(null);

  async function loadCurrent(nextTopicId: string) {
    currentRequestRef.current?.abort();
    const controller = new AbortController();
    currentRequestRef.current = controller;

    setCurrent(null);
    setCurrentStatus(nextTopicId ? "loading" : "idle");
    if (!nextTopicId) return;
    try {
      const res = await fetch(`/api/admin/lessons/${nextTopicId}`, {
        signal: controller.signal,
      });
      // `abort()` does not always reject a fetch that has already resolved, so
      // re-check before every state write: a superseded response must never
      // overwrite the newer request's state.
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setCurrentStatus("failed");
        return;
      }
      const data = (await res.json()) as Current;
      if (controller.signal.aborted) return;
      setCurrent(data);
      setCurrentStatus("loaded");
    } catch (err) {
      // A superseded request is not a failure — the request that replaced it
      // owns the state now and has already set it to "loading".
      if ((err as Error).name === "AbortError" || controller.signal.aborted) return;
      // A genuinely failed lookup means we don't know what's stored — the
      // confirm dialog below must not claim "will be created" on the strength
      // of this being null, since the likelier cause is an expired session,
      // not an empty topic. See currentStatus === "failed".
      setCurrentStatus("failed");
    }
  }

  // The deep link from /admin/lessons (`?topicId=...`) is the page's primary
  // entry path — without this, the confirm dialog would silently assert
  // "will be created" for a topic that already has a lesson. Intentionally
  // runs once on mount only — subsequent topic changes are driven by the
  // select's onChange handler. The cleanup abandons an in-flight mount fetch
  // so it cannot land after unmount (or, in development's double-invoked
  // effect, after the second run has taken ownership).
  useEffect(() => {
    if (initialTopicId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadCurrent(initialTopicId);
    }
    return () => currentRequestRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setMarkdown(text);
      setResult(null);
      // Frontmatter can name its own target — honour it when it resolves.
      const meta = validateLessonMarkdown(text).meta;
      if (meta.subject && meta.topic) {
        const bySlug = subjects.find((s) => s.slug === meta.subject);
        const topic = bySlug?.topics.find((t) => t.slug === meta.topic);
        if (bySlug && topic) {
          setSubjectId(bySlug.id);
          setTopicId(topic.id);
          void loadCurrent(topic.id);
        }
      }
    } catch {
      setResult({ ok: false, message: "Could not read that file." });
    } finally {
      // Reset so re-selecting the same file after editing the textarea still
      // fires a change event — matches src/app/admin/questions/import/page.tsx.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/lessons/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, markdown, confirm: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setResult({ ok: false, message: data?.error ?? `Save failed (${res.status}).` });
        return;
      }
      setResult({ ok: true, message: data.message as string });
      void loadCurrent(topicId);
    } catch {
      setResult({ ok: false, message: "Could not reach the server. Nothing was saved." });
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  // This dialog's only job is to state truthfully what is about to be
  // destroyed, so "we know nothing is stored" and "we do not yet know what is
  // stored" must not collapse into the same sentence. Only `"loaded"` licenses
  // a claim about the stored lesson; every other status — including the
  // `"loading"` window, which used to assert a create while a fetch was still
  // in flight — falls back to the conservative wording.
  const currentTopic = topics.find((t) => t.id === topicId) ?? null;
  const confirmTopicTitle =
    (currentStatus === "loaded" ? current?.topicTitle : null) ??
    currentTopic?.title ??
    "this topic";

  const confirmDescription =
    currentStatus !== "loaded"
      ? currentStatus === "loading"
        ? "Still checking what is currently stored — any existing lesson for this topic will be replaced."
        : "Could not read what is currently stored — any existing lesson for this topic will be replaced."
      : current?.lesson
        ? `${current.lesson.blockCount} existing block${current.lesson.blockCount === 1 ? "" : "s"} (${current.lesson.authored ? "authored" : "generated placeholder"}) will be replaced by ${parsed?.blocks.length ?? 0}.`
        : `A new lesson with ${parsed?.blocks.length ?? 0} block${(parsed?.blocks.length ?? 0) === 1 ? "" : "s"} will be created.`;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        {result && (
          <StatusBanner
            tone={result.ok ? "success" : "error"}
            title={result.ok ? "Lesson saved" : "Lesson not saved"}
            message={result.message}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={subjectInputId} className="block text-sm font-semibold text-foreground">
              Subject
            </label>
            <select
              id={subjectInputId}
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTopicId("");
                // Through loadCurrent, not a bare reset, so a lookup still in
                // flight for the previous subject's topic is abandoned rather
                // than left to land as "loaded" over the cleared selection.
                void loadCurrent("");
              }}
              className="mt-2 block w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
            >
              <option value="">Choose a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={topicInputId} className="block text-sm font-semibold text-foreground">
              Topic
            </label>
            <select
              id={topicInputId}
              value={topicId}
              disabled={!subject}
              onChange={(e) => {
                setTopicId(e.target.value);
                void loadCurrent(e.target.value);
              }}
              className="mt-2 block w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground disabled:opacity-50"
            >
              <option value="">Choose a topic…</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.curriculumLevel
                    ? `${t.curriculumLevel.classLevel} ${t.curriculumLevel.term} — ${t.title}`
                    : t.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {currentStatus !== "idle" && (
          <div className="rounded-lg border border-border-strong bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Currently stored</p>
            {currentStatus === "loading" && (
              <p className="mt-1 text-sm text-muted">Checking…</p>
            )}
            {currentStatus === "failed" && (
              <p className="mt-1 text-sm text-muted">
                Could not check what is currently stored for this topic.
              </p>
            )}
            {currentStatus === "loaded" && current && (
              current.lesson ? (
                <p className="mt-1 text-sm text-muted">
                  &ldquo;{current.lesson.title}&rdquo; — {current.lesson.blockCount} blocks,{" "}
                  {current.lesson.authored
                    ? "authored from a previous upload."
                    : "the generated placeholder."}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">No lesson yet. One will be created.</p>
              )
            )}
          </div>
        )}

        <div>
          <label htmlFor={fileInputId} className="block text-sm font-semibold text-foreground">
            Markdown file
          </label>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".md,.markdown,text/markdown"
            onChange={handleFileChange}
            className="mt-2 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-border"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground" htmlFor="lesson-markdown">
            Source
          </label>
          <textarea
            id="lesson-markdown"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={20}
            spellCheck={false}
            placeholder={SAMPLE}
            className="mt-2 block w-full rounded-lg border border-border bg-card p-3 font-mono text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </div>

        {parsed && parsed.errors.length > 0 && (
          <StatusBanner
            tone="error"
            title={`${parsed.errors.length} problem${parsed.errors.length === 1 ? "" : "s"} to fix`}
            message={parsed.errors
              .map((e) => (e.line ? `Line ${e.line}: ${e.message}` : e.message))
              .join(" · ")}
          />
        )}

        {parsed && parsed.warnings.length > 0 && (
          <StatusBanner
            tone="info"
            title={`${parsed.warnings.length} warning${parsed.warnings.length === 1 ? "" : "s"}`}
            message={parsed.warnings
              .map((w) => (w.line ? `Line ${w.line}: ${w.message}` : w.message))
              .join(" · ")}
          />
        )}

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setConfirming(true)} disabled={!canSave}>
            {submitting ? "Saving…" : "Save lesson"}
          </Button>
          <Link href="/admin/lessons" className={buttonClass("outline", "md")}>
            Back to lessons
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {parsed?.meta.docInfo && Object.keys(parsed.meta.docInfo).length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              From the file header
            </p>
            <dl className="mt-2 space-y-1">
              {Object.entries(parsed.meta.docInfo).map(([key, value]) => (
                <div key={key} className="flex gap-2 text-sm">
                  <dt className="font-semibold text-foreground shrink-0">{key}:</dt>
                  <dd className="text-foreground/90">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">
              Shown so you can confirm the right note — not saved to the lesson.
            </p>
          </div>
        )}
        <p className="text-sm font-semibold text-foreground">
          Preview — exactly what students will read
        </p>
        <div className="rounded-lg border border-border-strong bg-card p-5">
          {parsed && parsed.blocks.length > 0 ? (
            <LessonNotes blocks={parsed.blocks} fallbackContent={null} />
          ) : (
            <p className="text-sm text-muted">
              The preview appears here once there is something to render.
            </p>
          )}
        </div>

        {checks.length > 0 && (
          <div className="rounded-lg border border-border-strong bg-card p-5">
            <p className="text-sm font-semibold text-foreground">
              {checks.length} knowledge check{checks.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Checks appear in the card player, not in the notes view above.
            </p>
            <ul className="mt-3 space-y-3">
              {checks.map((check) => (
                <li key={check.id} className="text-sm">
                  <p className="font-medium text-foreground">{check.question}</p>
                  <p className="mt-1 text-xs text-muted">
                    Answer {check.answer}: {check.options[check.answer]} · after{" "}
                    <code>{check.afterCard}</code>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Replace the lesson for ${confirmTopicTitle}?`}
        description={confirmDescription}
        confirmLabel="Replace lesson"
        busy={submitting}
        onConfirm={handleSave}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
