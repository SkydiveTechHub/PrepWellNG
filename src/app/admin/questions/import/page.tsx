"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";
import { cn } from "@/lib/utils";
import {
  parseImportPayload,
  MAX_IMPORT_ROWS,
  type BulkImportQuestion,
  type ImportRowError,
} from "@/lib/admin-import";

const TH_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

const SAMPLE = `[
  {
    "subjectCode": "MTH",
    "topicSlug": "algebra",
    "examType": "WAEC",
    "examYear": 2019,
    "questionText": "Solve for x: 2x + 3 = 11",
    "options": { "A": "3", "B": "4", "C": "5", "D": "6" },
    "correctAnswer": "B",
    "explanation": "Subtract 3, then divide by 2.",
    "difficulty": "BASIC"
  }
]`;

type Phase = "input" | "preview" | "result";

type ServerResult =
  | {
      ok: true;
      message: string;
      imported: number;
      skipped: number;
      errors: Array<{ index: number; reason: string }>;
    }
  | { ok: false; message: string };

export default function AdminImportPage() {
  const [phase, setPhase] = useState<Phase>("input");

  const [raw, setRaw] = useState("");
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [rows, setRows] = useState<BulkImportQuestion[]>([]);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [total, setTotal] = useState(0);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ServerResult | null>(null);

  const fileInputId = useId();
  const textareaId = useId();
  const skipDuplicatesId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetToInput() {
    setPhase("input");
    setRaw("");
    setFatalError(null);
    setRows([]);
    setRowErrors([]);
    setTotal(0);
    setSkipDuplicates(true);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRaw(text);
      setFatalError(null);
    } catch {
      setFatalError("Could not read that file. Choose a JSON file and try again.");
    }
  }

  function handleValidate() {
    const parsed = parseImportPayload(raw);
    if (!parsed.ok) {
      setFatalError(parsed.fatal);
      return;
    }
    setFatalError(null);
    setRows(parsed.rows);
    setRowErrors(parsed.errors);
    setTotal(parsed.total);
    setPhase("preview");
  }

  async function handleImport() {
    setSubmitting(true);
    setPhase("result");
    try {
      const res = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: rows, skipDuplicates }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setResult({
          ok: false,
          message: data?.error ?? `Import failed (${res.status}).`,
        });
        return;
      }
      setResult({
        ok: true,
        message: data.message as string,
        imported: data.imported as number,
        skipped: data.skipped as number,
        errors: (data.errors ?? []) as Array<{ index: number; reason: string }>,
      });
    } catch {
      setResult({
        ok: false,
        message: "Could not reach the server. No questions were imported.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Import questions"
        description="Validate a batch of questions before sending it to the database."
      />

      {phase === "input" && (
        <div className="max-w-3xl space-y-6">
          {fatalError && (
            <StatusBanner tone="error" title="This file cannot be validated" message={fatalError} />
          )}

          <div className="rounded-lg border border-border-strong bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Expected shape</p>
            <p className="mt-1 text-sm text-muted">
              An array of questions, or an object shaped <code>{`{ "questions": [ ... ] }`}</code>. Up to{" "}
              <span className="tabular-nums">{MAX_IMPORT_ROWS}</span> questions per file.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-border-strong bg-secondary/50 p-3 text-xs text-foreground">
              {SAMPLE}
            </pre>
          </div>

          <div>
            <label htmlFor={fileInputId} className="block text-sm font-semibold text-foreground">
              Upload a JSON file
            </label>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="application/json"
              onChange={handleFileChange}
              className="mt-2 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-border"
            />
          </div>

          <div>
            <label htmlFor={textareaId} className="block text-sm font-semibold text-foreground">
              Or paste JSON
            </label>
            <textarea
              id={textareaId}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={12}
              spellCheck={false}
              placeholder={SAMPLE}
              className="mt-2 block w-full rounded-lg border border-border bg-card p-3 font-mono text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>

          <Button variant="primary" onClick={handleValidate} disabled={raw.trim().length === 0}>
            Validate
          </Button>
        </div>
      )}

      {phase === "preview" && (
        <div className="max-w-3xl space-y-6">
          <StatusBanner
            tone={rowErrors.length > 0 ? "info" : "success"}
            title={`${rows.length} of ${total} rows are valid`}
            message={
              rowErrors.length > 0
                ? `${rowErrors.length} row${rowErrors.length === 1 ? "" : "s"} failed validation and will be skipped if you continue. Only the ${rows.length} valid row${rows.length === 1 ? "" : "s"} below will be sent.`
                : undefined
            }
          />

          {rowErrors.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border-strong bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">Rows that failed validation</caption>
                <thead>
                  <tr className="border-b border-border-strong bg-secondary/50">
                    <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>
                      Row
                    </th>
                    <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>
                      Field
                    </th>
                    <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-strong">
                  {rowErrors.map((err, i) => (
                    <tr key={`${err.index}-${err.field}-${i}`}>
                      <td className="px-4 py-3 tabular-nums text-foreground">{err.index}</td>
                      <td className="px-4 py-3 text-foreground">{err.field}</td>
                      <td className="px-4 py-3 text-muted">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id={skipDuplicatesId}
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="h-4 w-4 rounded border-border focus-visible:ring-2 focus-visible:ring-primary/60"
            />
            <label htmlFor={skipDuplicatesId} className="text-sm text-foreground">
              Skip duplicates (same subject, exam type, exam year, and question text)
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setPhase("input")}>
              Back
            </Button>
            <Button variant="primary" onClick={handleImport} disabled={rows.length === 0}>
              Import {rows.length} question{rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="max-w-3xl space-y-6">
          {submitting ? (
            <div className="flex items-center gap-3 rounded-lg border border-border-strong bg-card p-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
              <p role="status" className="text-sm text-foreground">
                Importing {rows.length} question{rows.length === 1 ? "" : "s"}…
              </p>
            </div>
          ) : result?.ok === false ? (
            <StatusBanner tone="error" title="Import failed" message={result.message} />
          ) : result?.ok === true ? (
            <div role="status" className="space-y-4">
              <StatusBanner
                tone={result.errors.length > 0 ? "info" : "success"}
                title={result.message}
                message={
                  result.errors.length > 0
                    ? `${result.errors.length} row${result.errors.length === 1 ? "" : "s"} could not be imported. See the errors below — this was not a complete import.`
                    : undefined
                }
              />

              <dl className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border-strong bg-card p-4">
                  <dt className={TH_CLS}>Imported</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{result.imported}</dd>
                </div>
                <div className="rounded-lg border border-border-strong bg-card p-4">
                  <dt className={TH_CLS}>Skipped (duplicates)</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{result.skipped}</dd>
                </div>
                <div className="rounded-lg border border-border-strong bg-card p-4">
                  <dt className={TH_CLS}>Errors</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{result.errors.length}</dd>
                </div>
              </dl>

              {result.errors.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border-strong bg-card">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Rows the server could not import</caption>
                    <thead>
                      <tr className="border-b border-border-strong bg-secondary/50">
                        <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>
                          Row
                        </th>
                        <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>
                          Reason
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-strong">
                      {result.errors.map((err, i) => (
                        <tr key={`${err.index}-${i}`}>
                          <td className="px-4 py-3 tabular-nums text-foreground">{err.index}</td>
                          <td className="px-4 py-3 text-muted">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {!submitting && (
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={resetToInput}>
                Import another file
              </Button>
              <Link href="/admin/questions" className={buttonClass("primary", "md")}>
                View questions
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
