"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusBanner } from "@/components/admin/status-banner";
import { BODY_MAX, TITLE_MAX } from "@/lib/push-payload";
import { describeAudience, type AudienceFilter } from "@/lib/push-audience";
import { CONFIRM_TYPED_THRESHOLD, needsTypedConfirm } from "@/lib/announcement";

const INPUT_CLS =
  "w-full min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

const OPTIONS = {
  examTargets: ["WAEC", "JAMB", "NECO"],
  classLevels: ["SS1", "SS2", "SS3"],
  tracks: ["SCIENCE", "ARTS", "COMMERCIAL"],
  tiers: ["FREEMIUM", "STANDARD", "PREMIUM"],
} as const;

const LABELS: Record<keyof typeof OPTIONS, string> = {
  examTargets: "Exam (students with a study plan for…)",
  classLevels: "Class",
  tracks: "Track",
  tiers: "Plan",
};

type Preview = { students: number; subscribedStudents: number; devices: number };
type Group = keyof typeof OPTIONS;

export function AnnouncementComposer({ pushConfigured }: { pushConfigured: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [selected, setSelected] = useState<Record<Group, string[]>>({
    examTargets: [],
    classLevels: [],
    tracks: [],
    tiers: [],
  });
  const [preview, setPreview] = useState<{ key: string; counts: Preview } | null>(null);
  const [contact, setContact] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"send" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const audience = useMemo<AudienceFilter>(() => {
    const filter: Record<string, string[]> = {};
    for (const group of Object.keys(selected) as Group[]) {
      if (selected[group].length) filter[group] = selected[group];
    }
    return filter as AudienceFilter;
  }, [selected]);

  const audienceKey = JSON.stringify(audience);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/admin/api/announcements/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience }),
          signal: controller.signal,
        });
        if (res.ok) setPreview({ key: audienceKey, counts: await res.json() });
      } catch {
        // Aborted or offline: keep the last count.
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [audience, audienceKey]);

  function toggle(group: Group, value: string) {
    setSelected((prev) => ({
      ...prev,
      [group]: prev[group].includes(value)
        ? prev[group].filter((v) => v !== value)
        : [...prev[group], value],
    }));
  }

  const currentPreview = preview?.key === audienceKey ? preview.counts : null;
  const message = { title: title.trim(), body: body.trim(), url: url.trim() || null };
  const canSubmit = message.title.length > 0 && message.body.length > 0;
  const typedRequired = needsTypedConfirm(currentPreview?.devices ?? 0);

  async function sendTest() {
    setBusy("test");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/admin/api/announcements/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...message, contact }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send the test");
        return;
      }
      setSuccess(
        data.devices === 0
          ? `${data.student} has no devices with notifications turned on.`
          : `Test sent to ${data.student}: ${data.sent} of ${data.devices} devices accepted it.`,
      );
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/admin/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...message, audience, expiresInDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send the announcement");
        return;
      }
      setConfirmOpen(false);
      setTyped("");
      setTitle("");
      setBody("");
      setUrl("");
      setSuccess(`Queued for ${data.recipientCount} devices. Sending has started.`);
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-border-strong bg-card p-4 sm:p-5">
      <h2 className="text-base font-bold text-foreground">New announcement</h2>
      {error && <StatusBanner tone="error" title={error} className="mt-4" />}
      {success && <StatusBanner tone="success" title={success} className="mt-4" />}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4 min-w-0">
          <label className="block text-sm">
            <span className="font-semibold">Title</span>
            <input className={INPUT_CLS} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
            <span className="text-xs text-muted">{title.length}/{TITLE_MAX}</span>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Message</span>
            <textarea className={INPUT_CLS} rows={3} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} />
            <span className="text-xs text-muted">{body.length}/{BODY_MAX}</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">Link (optional)</span>
              <input className={INPUT_CLS} placeholder="/practice" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Banner shows for (days)</span>
              <input
                className={INPUT_CLS}
                type="number"
                min={1}
                max={30}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))}
              />
            </label>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Audience (blank = all students)</legend>
            {(Object.keys(OPTIONS) as Group[]).map((group) => (
              <div key={group}>
                <p className="text-xs text-muted">{LABELS[group]}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {OPTIONS[group].map((value) => (
                    <label key={value} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm">
                      <input type="checkbox" checked={selected[group].includes(value)} onChange={() => toggle(group, value)} />
                      {value[0] + value.slice(1).toLowerCase()}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-sm text-foreground">
              {currentPreview
                ? `${describeAudience(audience)}: reaches ${currentPreview.devices} devices (${currentPreview.subscribedStudents} students). ${currentPreview.students - currentPreview.subscribedStudents} more students will see only the banner.`
                : "Counting…"}
            </p>
          </fieldset>
        </div>

        <aside className="space-y-4 min-w-0">
          <div aria-label="Notification preview" className="rounded-2xl border border-border bg-secondary p-3">
            <p className="text-xs text-muted">ScholarsCrib · now</p>
            <p className="mt-1 text-sm font-semibold text-foreground break-words">{title || "Title"}</p>
            <p className="text-sm text-foreground break-words">{body || "Your message"}</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm">
              <span className="font-semibold">Send a test to a student account</span>
              <input className={INPUT_CLS} placeholder="email or phone" value={contact} onChange={(e) => setContact(e.target.value)} />
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={!pushConfigured || !canSubmit || !contact.trim() || busy !== null}
              onClick={sendTest}
            >
              {busy === "test" ? "Sending test…" : "Send test"}
            </Button>
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || currentPreview === null || busy !== null}
            onClick={() => setConfirmOpen(true)}
          >
            Send announcement
          </Button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Send this announcement?"
        description={`"${message.title}" goes to ${currentPreview?.devices ?? 0} devices now and shows on dashboards for ${expiresInDays} days. This can be cancelled while sending, but notifications already delivered stay delivered.`}
        confirmLabel="Send"
        busy={busy === "send"}
        disabled={typedRequired && typed !== "SEND"}
        onConfirm={send}
        onCancel={() => {
          setConfirmOpen(false);
          setTyped("");
        }}
      >
        {typedRequired && (
          <label className="block text-sm">
            <span>
              This reaches {CONFIRM_TYPED_THRESHOLD}+ devices. Type <strong>SEND</strong> to confirm.
            </span>
            <input className={INPUT_CLS} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
        )}
      </ConfirmDialog>
    </section>
  );
}
