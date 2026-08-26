"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button, buttonClass } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";
import { cn } from "@/lib/utils";
import { MIN_OBJECTIVE_OPTIONS } from "@/lib/admin-question";
import {
  adminQuestionCreateSchema,
  adminQuestionUpdateSchema,
} from "@/lib/validators";

export type QuestionFormSubject = { id: string; name: string; code: string };
export type QuestionFormTopic = { id: string; title: string; subjectId: string };

export type QuestionFormInitial = {
  id: string;
  subjectId: string;
  topicId: string | null;
  examType: "WAEC" | "JAMB" | "NECO" | "CUSTOM";
  examYear: number | null;
  questionNumber: number | null;
  questionText: string;
  questionImageUrl: string | null;
  questionType: "OBJECTIVE" | "THEORY" | "FILL_IN_BLANK";
  options: Record<string, string> | null;
  correctAnswer: string;
  explanation: string;
  explanationImageUrl: string | null;
  difficulty: "BASIC" | "INTERMEDIATE" | "ADVANCED";
  marks: number;
  timeEstimateSeconds: number;
};

type ExamType = QuestionFormInitial["examType"];
type QuestionType = QuestionFormInitial["questionType"];
type Difficulty = QuestionFormInitial["difficulty"];

type OptionRow = { id: string; key: string; value: string };

const INPUT_CLS =
  "mt-2 block w-full rounded-lg border bg-card p-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

const LABEL_CLS = "block text-sm font-semibold text-foreground";

// Field order drives which control receives focus first after a failed
// submit — it must mirror the order fields appear in the form, not the
// schema declaration order, so focus lands on the first *visible* problem.
const FIELD_ORDER = [
  "subjectId",
  "topicId",
  "examType",
  "examYear",
  "questionNumber",
  "questionText",
  "questionType",
  "options",
  "correctAnswer",
  "difficulty",
  "marks",
  "timeEstimateSeconds",
  "explanation",
  "questionImageUrl",
  "explanationImageUrl",
] as const;

// Row ids only need to be stable and unique within the current render tree —
// they are never persisted — so seeding uses deterministic strings instead of
// a ref-backed counter, which would mean touching a ref during render.
function seedOptionRows(): OptionRow[] {
  return Array.from({ length: MIN_OBJECTIVE_OPTIONS }, (_, i) => ({
    id: `seed-${i}`,
    key: String.fromCharCode(65 + i),
    value: "",
  }));
}

function optionsToRows(options: Record<string, string> | null): OptionRow[] {
  if (!options || Object.keys(options).length === 0) return [];
  return Object.entries(options).map(([key, value]) => ({
    id: `init-${key}`,
    key,
    value,
  }));
}

function rowsToOptions(rows: OptionRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    out[key] = row.value;
  }
  return out;
}

function toNumberOrNull(str: string): number | null {
  const trimmed = str.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function toNumberOrUndefined(str: string): number | undefined {
  const trimmed = str.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

function textOrNull(str: string): string | null {
  const trimmed = str.trim();
  return trimmed === "" ? null : trimmed;
}

function FieldError({ field, message }: { field: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${field}-error`} className="mt-1.5 text-sm text-danger">
      {message}
    </p>
  );
}

export function QuestionForm(props: {
  mode: "create" | "edit";
  subjects: QuestionFormSubject[];
  topics: QuestionFormTopic[];
  /** Required when mode === "edit". */
  initial?: QuestionFormInitial;
}) {
  const { mode, subjects, topics, initial } = props;
  const router = useRouter();

  const rowIdCounter = useRef(0);

  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [topicId, setTopicId] = useState(initial?.topicId ?? "");
  const [examType, setExamType] = useState<ExamType>(initial?.examType ?? "WAEC");
  const [examYearStr, setExamYearStr] = useState(
    initial?.examYear != null ? String(initial.examYear) : "",
  );
  const [questionNumberStr, setQuestionNumberStr] = useState(
    initial?.questionNumber != null ? String(initial.questionNumber) : "",
  );
  const [questionText, setQuestionText] = useState(initial?.questionText ?? "");
  const [questionImageUrl, setQuestionImageUrl] = useState(
    initial?.questionImageUrl ?? "",
  );
  const [questionType, setQuestionType] = useState<QuestionType>(
    initial?.questionType ?? "OBJECTIVE",
  );
  const [optionRows, setOptionRows] = useState<OptionRow[]>(() => {
    if (initial) {
      return initial.questionType === "OBJECTIVE" ? optionsToRows(initial.options) : [];
    }
    return seedOptionRows();
  });
  const [correctAnswer, setCorrectAnswer] = useState(initial?.correctAnswer ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [explanationImageUrl, setExplanationImageUrl] = useState(
    initial?.explanationImageUrl ?? "",
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    initial?.difficulty ?? "INTERMEDIATE",
  );
  const [marksStr, setMarksStr] = useState(
    initial?.marks != null ? String(initial.marks) : "1",
  );
  const [timeEstimateSecondsStr, setTimeEstimateSecondsStr] = useState(
    initial?.timeEstimateSeconds != null ? String(initial.timeEstimateSeconds) : "90",
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One ref per focusable field so a failed submit can move focus to the
  // first invalid control. Plain RefObjects assigned directly to `ref` —
  // no inline callbacks — keep this safe to read from event handlers.
  const subjectRef = useRef<HTMLSelectElement>(null);
  const topicRef = useRef<HTMLSelectElement>(null);
  const examTypeRef = useRef<HTMLSelectElement>(null);
  const examYearRef = useRef<HTMLInputElement>(null);
  const questionNumberRef = useRef<HTMLInputElement>(null);
  const questionTextRef = useRef<HTMLTextAreaElement>(null);
  const questionTypeRef = useRef<HTMLSelectElement>(null);
  const optionsSectionRef = useRef<HTMLDivElement>(null);
  const correctAnswerSelectRef = useRef<HTMLSelectElement>(null);
  const correctAnswerInputRef = useRef<HTMLInputElement>(null);
  const difficultyRef = useRef<HTMLSelectElement>(null);
  const marksRef = useRef<HTMLInputElement>(null);
  const timeEstimateRef = useRef<HTMLInputElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const questionImageUrlRef = useRef<HTMLInputElement>(null);
  const explanationImageUrlRef = useRef<HTMLInputElement>(null);

  const subjectSelectId = useId();
  const topicSelectId = useId();
  const examTypeId = useId();
  const examYearId = useId();
  const questionNumberId = useId();
  const questionTextId = useId();
  const questionTypeId = useId();
  const correctAnswerId = useId();
  const explanationId = useId();
  const difficultyId = useId();
  const marksId = useId();
  const timeEstimateId = useId();
  const questionImageUrlId = useId();
  const explanationImageUrlId = useId();

  const filteredTopics = useMemo(
    () => topics.filter((t) => t.subjectId === subjectId),
    [topics, subjectId],
  );

  const optionKeys = useMemo(
    () =>
      Array.from(
        new Set(optionRows.map((r) => r.key.trim()).filter((k) => k.length > 0)),
      ),
    [optionRows],
  );

  const isObjective = questionType === "OBJECTIVE";
  const errorCount = Object.keys(errors).length;

  // The invariant this form must make unrepresentable: for OBJECTIVE
  // questions, correctAnswer can only ever be one of the current option
  // keys. If a row is renamed or removed out from under the selection,
  // clear the selection rather than let a dangling value slip through to
  // submit. This runs inline in the handlers that can change the key set
  // (not an effect) so it happens synchronously with the edit that caused it.
  function syncCorrectAnswerToKeys(rows: OptionRow[]) {
    if (questionType !== "OBJECTIVE") return;
    const keys = new Set(rows.map((r) => r.key.trim()).filter((k) => k.length > 0));
    setCorrectAnswer((prev) => (prev && !keys.has(prev) ? "" : prev));
  }

  function handleSubjectChange(next: string) {
    setSubjectId(next);
    setTopicId(""); // a topic from the previous subject is no longer valid
  }

  function handleQuestionTypeChange(next: QuestionType) {
    setQuestionType(next);
    if (next === "OBJECTIVE" && optionRows.length === 0) {
      setOptionRows(seedOptionRows());
    }
  }

  function addOptionRow() {
    rowIdCounter.current += 1;
    setOptionRows((rows) => [
      ...rows,
      { id: `new-${rowIdCounter.current}`, key: "", value: "" },
    ]);
  }

  function removeOptionRow(id: string) {
    const newRows = optionRows.filter((r) => r.id !== id);
    setOptionRows(newRows);
    syncCorrectAnswerToKeys(newRows);
  }

  function updateOptionRow(id: string, patch: Partial<Pick<OptionRow, "key" | "value">>) {
    const newRows = optionRows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setOptionRows(newRows);
    syncCorrectAnswerToKeys(newRows);
  }

  function focusFirstInvalid(fieldErrors: Record<string, string>) {
    for (const field of FIELD_ORDER) {
      if (!fieldErrors[field]) continue;
      switch (field) {
        case "subjectId":
          subjectRef.current?.focus();
          return;
        case "topicId":
          topicRef.current?.focus();
          return;
        case "examType":
          examTypeRef.current?.focus();
          return;
        case "examYear":
          examYearRef.current?.focus();
          return;
        case "questionNumber":
          questionNumberRef.current?.focus();
          return;
        case "questionText":
          questionTextRef.current?.focus();
          return;
        case "questionType":
          questionTypeRef.current?.focus();
          return;
        case "options":
          optionsSectionRef.current?.focus();
          return;
        case "correctAnswer":
          (isObjective ? correctAnswerSelectRef.current : correctAnswerInputRef.current)?.focus();
          return;
        case "difficulty":
          difficultyRef.current?.focus();
          return;
        case "marks":
          marksRef.current?.focus();
          return;
        case "timeEstimateSeconds":
          timeEstimateRef.current?.focus();
          return;
        case "explanation":
          explanationRef.current?.focus();
          return;
        case "questionImageUrl":
          questionImageUrlRef.current?.focus();
          return;
        case "explanationImageUrl":
          explanationImageUrlRef.current?.focus();
          return;
      }
    }
  }

  function buildBaseFields() {
    return {
      subjectId,
      topicId: topicId ? topicId : null,
      examType,
      examYear: toNumberOrNull(examYearStr),
      questionNumber: toNumberOrNull(questionNumberStr),
      questionText,
      questionImageUrl: textOrNull(questionImageUrl),
      questionType,
      options: questionType === "OBJECTIVE" ? rowsToOptions(optionRows) : null,
      correctAnswer,
      explanation,
      explanationImageUrl: textOrNull(explanationImageUrl),
      difficulty,
      marks: toNumberOrUndefined(marksStr) ?? 1,
      timeEstimateSeconds: toNumberOrUndefined(timeEstimateSecondsStr) ?? 90,
    };
  }

  function buildPatch(): Record<string, unknown> {
    if (!initial) return {};
    const patch: Record<string, unknown> = {};

    if (subjectId !== initial.subjectId) patch.subjectId = subjectId;

    const nextTopicId = topicId ? topicId : null;
    if (nextTopicId !== initial.topicId) patch.topicId = nextTopicId;

    if (examType !== initial.examType) patch.examType = examType;

    const nextExamYear = toNumberOrNull(examYearStr);
    if (nextExamYear !== initial.examYear) patch.examYear = nextExamYear;

    const nextQuestionNumber = toNumberOrNull(questionNumberStr);
    if (nextQuestionNumber !== initial.questionNumber)
      patch.questionNumber = nextQuestionNumber;

    if (questionText !== initial.questionText) patch.questionText = questionText;

    const nextQuestionImageUrl = textOrNull(questionImageUrl);
    if (nextQuestionImageUrl !== initial.questionImageUrl)
      patch.questionImageUrl = nextQuestionImageUrl;

    if (questionType !== initial.questionType) patch.questionType = questionType;

    const nextOptions = questionType === "OBJECTIVE" ? rowsToOptions(optionRows) : null;
    const optionsChanged =
      JSON.stringify(nextOptions ?? null) !== JSON.stringify(initial.options ?? null);
    if (optionsChanged) patch.options = nextOptions;

    if (correctAnswer !== initial.correctAnswer) patch.correctAnswer = correctAnswer;

    if (explanation !== initial.explanation) patch.explanation = explanation;

    const nextExplanationImageUrl = textOrNull(explanationImageUrl);
    if (nextExplanationImageUrl !== initial.explanationImageUrl)
      patch.explanationImageUrl = nextExplanationImageUrl;

    if (difficulty !== initial.difficulty) patch.difficulty = difficulty;

    const nextMarks = toNumberOrUndefined(marksStr) ?? initial.marks;
    if (nextMarks !== initial.marks) patch.marks = nextMarks;

    const nextTimeEstimate =
      toNumberOrUndefined(timeEstimateSecondsStr) ?? initial.timeEstimateSeconds;
    if (nextTimeEstimate !== initial.timeEstimateSeconds)
      patch.timeEstimateSeconds = nextTimeEstimate;

    return patch;
  }

  function applyZodErrors(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
    const flat = error.flatten();
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(flat.fieldErrors)) {
      if (messages && messages.length > 0) fieldErrors[field] = messages[0];
    }
    return fieldErrors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    if (mode === "create") {
      const parsed = adminQuestionCreateSchema.safeParse(buildBaseFields());
      if (!parsed.success) {
        const fieldErrors = applyZodErrors(parsed.error);
        setErrors(fieldErrors);
        focusFirstInvalid(fieldErrors);
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/admin/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) {
          await handleServerError(res);
          return;
        }
        router.push("/admin/questions");
        router.refresh();
      } catch {
        setFormError("Could not reach the server. The question was not saved.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Edit mode: only send what changed.
    if (!initial) return;
    const patch = buildPatch();
    const parsed = adminQuestionUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      const fieldErrors = applyZodErrors(parsed.error);
      if (Object.keys(fieldErrors).length === 0) {
        setFormError("Change at least one field before saving.");
        return;
      }
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/admin/api/questions/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        await handleServerError(res);
        return;
      }
      router.push("/admin/questions");
      router.refresh();
    } catch {
      setFormError("Could not reach the server. The question was not saved.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleServerError(res: Response) {
    const data = await res.json().catch(() => null);
    if (data?.field) {
      const fieldErrors = { [data.field as string]: data.error as string };
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
      return;
    }
    if (data?.details?.fieldErrors) {
      const fieldErrors: Record<string, string> = {};
      for (const [field, messages] of Object.entries(
        data.details.fieldErrors as Record<string, string[]>,
      )) {
        if (messages && messages.length > 0) fieldErrors[field] = messages[0];
      }
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        focusFirstInvalid(fieldErrors);
        return;
      }
    }
    setFormError(data?.error ?? `Save failed (${res.status}).`);
  }

  function describedBy(field: string) {
    return errors[field] ? `${field}-error` : undefined;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6" noValidate>
      {formError && (
        <StatusBanner tone="error" title="Could not save the question" message={formError} />
      )}

      {errorCount > 0 && (
        <p role="status" className="text-sm font-semibold text-danger">
          {errorCount} field{errorCount === 1 ? "" : "s"} need attention before this can be saved.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <div>
          <label htmlFor={subjectSelectId} className={LABEL_CLS}>
            Subject
          </label>
          <select
            id={subjectSelectId}
            ref={subjectRef}
            value={subjectId}
            onChange={(e) => handleSubjectChange(e.target.value)}
            aria-invalid={Boolean(errors.subjectId)}
            aria-describedby={describedBy("subjectId")}
            className={cn(INPUT_CLS, errors.subjectId ? "border-danger" : "border-border")}
          >
            <option value="">Select a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <FieldError field="subjectId" message={errors.subjectId} />
        </div>

        <div>
          <label htmlFor={topicSelectId} className={LABEL_CLS}>
            Topic
          </label>
          <select
            id={topicSelectId}
            ref={topicRef}
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            disabled={!subjectId}
            aria-invalid={Boolean(errors.topicId)}
            aria-describedby={describedBy("topicId")}
            className={cn(
              INPUT_CLS,
              errors.topicId ? "border-danger" : "border-border",
              !subjectId && "opacity-50",
            )}
          >
            <option value="">No specific topic</option>
            {filteredTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <FieldError field="topicId" message={errors.topicId} />
        </div>

        <div>
          <label htmlFor={examTypeId} className={LABEL_CLS}>
            Exam type
          </label>
          <select
            id={examTypeId}
            ref={examTypeRef}
            value={examType}
            onChange={(e) => setExamType(e.target.value as ExamType)}
            aria-invalid={Boolean(errors.examType)}
            aria-describedby={describedBy("examType")}
            className={cn(INPUT_CLS, errors.examType ? "border-danger" : "border-border")}
          >
            <option value="WAEC">WAEC</option>
            <option value="JAMB">JAMB</option>
            <option value="NECO">NECO</option>
            <option value="CUSTOM">CUSTOM</option>
          </select>
          <FieldError field="examType" message={errors.examType} />
        </div>

        <div>
          <label htmlFor={examYearId} className={LABEL_CLS}>
            Exam year <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={examYearId}
            ref={examYearRef}
            type="number"
            inputMode="numeric"
            value={examYearStr}
            onChange={(e) => setExamYearStr(e.target.value)}
            aria-invalid={Boolean(errors.examYear)}
            aria-describedby={describedBy("examYear")}
            className={cn(
              INPUT_CLS,
              "tabular-nums",
              errors.examYear ? "border-danger" : "border-border",
            )}
          />
          <FieldError field="examYear" message={errors.examYear} />
        </div>

        <div>
          <label htmlFor={questionNumberId} className={LABEL_CLS}>
            Question number <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={questionNumberId}
            ref={questionNumberRef}
            type="number"
            inputMode="numeric"
            value={questionNumberStr}
            onChange={(e) => setQuestionNumberStr(e.target.value)}
            aria-invalid={Boolean(errors.questionNumber)}
            aria-describedby={describedBy("questionNumber")}
            className={cn(
              INPUT_CLS,
              "tabular-nums",
              errors.questionNumber ? "border-danger" : "border-border",
            )}
          />
          <FieldError field="questionNumber" message={errors.questionNumber} />
        </div>

        <div>
          <label htmlFor={questionTypeId} className={LABEL_CLS}>
            Question type
          </label>
          <select
            id={questionTypeId}
            ref={questionTypeRef}
            value={questionType}
            onChange={(e) => handleQuestionTypeChange(e.target.value as QuestionType)}
            aria-invalid={Boolean(errors.questionType)}
            aria-describedby={describedBy("questionType")}
            className={cn(INPUT_CLS, errors.questionType ? "border-danger" : "border-border")}
          >
            <option value="OBJECTIVE">Objective</option>
            <option value="THEORY">Theory</option>
            <option value="FILL_IN_BLANK">Fill in the blank</option>
          </select>
          <FieldError field="questionType" message={errors.questionType} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={questionTextId} className={LABEL_CLS}>
            Question text
          </label>
          <textarea
            id={questionTextId}
            ref={questionTextRef}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            rows={4}
            aria-invalid={Boolean(errors.questionText)}
            aria-describedby={describedBy("questionText")}
            className={cn(INPUT_CLS, errors.questionText ? "border-danger" : "border-border")}
          />
          <FieldError field="questionText" message={errors.questionText} />
        </div>
      </div>

      {isObjective && (
        <div
          ref={optionsSectionRef}
          tabIndex={-1}
          className="rounded-lg border border-border-strong bg-card p-4 focus:outline-none"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Options</p>
            <Button type="button" variant="outline" size="sm" onClick={addOptionRow}>
              Add option
            </Button>
          </div>
          <FieldError field="options" message={errors.options} />

          <div className="mt-3 space-y-3">
            {optionRows.map((row, i) => {
              const keyId = `option-${row.id}-key`;
              const valueId = `option-${row.id}-value`;
              return (
                <div key={row.id} className="flex items-start gap-3">
                  <div className="w-20 flex-shrink-0">
                    <label htmlFor={keyId} className="sr-only">
                      Option {i + 1} key
                    </label>
                    <input
                      id={keyId}
                      value={row.key}
                      onChange={(e) => updateOptionRow(row.id, { key: e.target.value })}
                      placeholder="Key"
                      className={cn(INPUT_CLS, "mt-0 border-border")}
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor={valueId} className="sr-only">
                      Option {i + 1} text
                    </label>
                    <input
                      id={valueId}
                      value={row.value}
                      onChange={(e) => updateOptionRow(row.id, { value: e.target.value })}
                      placeholder="Option text"
                      className={cn(INPUT_CLS, "mt-0 border-border")}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-0.5"
                    onClick={() => removeOptionRow(row.id)}
                    aria-label={`Remove option ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <div>
          <label htmlFor={correctAnswerId} className={LABEL_CLS}>
            Correct answer
          </label>
          {isObjective ? (
            <select
              id={correctAnswerId}
              ref={correctAnswerSelectRef}
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              aria-invalid={Boolean(errors.correctAnswer)}
              aria-describedby={describedBy("correctAnswer")}
              className={cn(
                INPUT_CLS,
                errors.correctAnswer ? "border-danger" : "border-border",
              )}
            >
              <option value="">Select the correct option…</option>
              {optionKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={correctAnswerId}
              ref={correctAnswerInputRef}
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              aria-invalid={Boolean(errors.correctAnswer)}
              aria-describedby={describedBy("correctAnswer")}
              className={cn(
                INPUT_CLS,
                errors.correctAnswer ? "border-danger" : "border-border",
              )}
            />
          )}
          <FieldError field="correctAnswer" message={errors.correctAnswer} />
        </div>

        <div>
          <label htmlFor={difficultyId} className={LABEL_CLS}>
            Difficulty
          </label>
          <select
            id={difficultyId}
            ref={difficultyRef}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            aria-invalid={Boolean(errors.difficulty)}
            aria-describedby={describedBy("difficulty")}
            className={cn(INPUT_CLS, errors.difficulty ? "border-danger" : "border-border")}
          >
            <option value="BASIC">Basic</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
          <FieldError field="difficulty" message={errors.difficulty} />
        </div>

        <div>
          <label htmlFor={marksId} className={LABEL_CLS}>
            Marks
          </label>
          <input
            id={marksId}
            ref={marksRef}
            type="number"
            inputMode="numeric"
            value={marksStr}
            onChange={(e) => setMarksStr(e.target.value)}
            aria-invalid={Boolean(errors.marks)}
            aria-describedby={describedBy("marks")}
            className={cn(INPUT_CLS, "tabular-nums", errors.marks ? "border-danger" : "border-border")}
          />
          <FieldError field="marks" message={errors.marks} />
        </div>

        <div>
          <label htmlFor={timeEstimateId} className={LABEL_CLS}>
            Time estimate (seconds)
          </label>
          <input
            id={timeEstimateId}
            ref={timeEstimateRef}
            type="number"
            inputMode="numeric"
            value={timeEstimateSecondsStr}
            onChange={(e) => setTimeEstimateSecondsStr(e.target.value)}
            aria-invalid={Boolean(errors.timeEstimateSeconds)}
            aria-describedby={describedBy("timeEstimateSeconds")}
            className={cn(
              INPUT_CLS,
              "tabular-nums",
              errors.timeEstimateSeconds ? "border-danger" : "border-border",
            )}
          />
          <FieldError field="timeEstimateSeconds" message={errors.timeEstimateSeconds} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={explanationId} className={LABEL_CLS}>
            Explanation
          </label>
          <textarea
            id={explanationId}
            ref={explanationRef}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={4}
            aria-invalid={Boolean(errors.explanation)}
            aria-describedby={describedBy("explanation")}
            className={cn(INPUT_CLS, errors.explanation ? "border-danger" : "border-border")}
          />
          <FieldError field="explanation" message={errors.explanation} />
        </div>

        <div>
          <label htmlFor={questionImageUrlId} className={LABEL_CLS}>
            Question image URL <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={questionImageUrlId}
            ref={questionImageUrlRef}
            value={questionImageUrl}
            onChange={(e) => setQuestionImageUrl(e.target.value)}
            aria-invalid={Boolean(errors.questionImageUrl)}
            aria-describedby={describedBy("questionImageUrl")}
            className={cn(
              INPUT_CLS,
              errors.questionImageUrl ? "border-danger" : "border-border",
            )}
          />
          <FieldError field="questionImageUrl" message={errors.questionImageUrl} />
        </div>

        <div>
          <label htmlFor={explanationImageUrlId} className={LABEL_CLS}>
            Explanation image URL <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={explanationImageUrlId}
            ref={explanationImageUrlRef}
            value={explanationImageUrl}
            onChange={(e) => setExplanationImageUrl(e.target.value)}
            aria-invalid={Boolean(errors.explanationImageUrl)}
            aria-describedby={describedBy("explanationImageUrl")}
            className={cn(
              INPUT_CLS,
              errors.explanationImageUrl ? "border-danger" : "border-border",
            )}
          />
          <FieldError field="explanationImageUrl" message={errors.explanationImageUrl} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Create question" : "Save changes"}
        </Button>
        <Link href="/admin/questions" className={buttonClass("outline", "md")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
