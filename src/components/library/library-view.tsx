"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  LuBook,
  LuFileText,
  LuVideo,
  LuLink,
  LuClipboardList,
  LuScrollText,
  LuFile,
  LuArrowLeft,
  LuExternalLink,
  LuBookOpenText,
  LuBookOpen,
  LuInbox,
} from "react-icons/lu";
import { TRACK_LABELS, TRACK_COLORS, type TrackCategory } from "@/lib/subjects";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PDFReader = dynamic(
  () => import("@/components/library/pdf-reader"),
  { ssr: false },
);

type SubjectResource = {
  id: string;
  subjectId: string;
  title: string;
  description: string | null;
  resourceType: string;
  url: string;
  author: string | null;
  isFree: boolean;
  orderIndex: number;
  /** Set by the server when this resource needs a plan the viewer lacks. */
  locked?: boolean;
};

type Subject = {
  id: string;
  name: string;
  slug: string;
  code: string;
  description: string;
  trackCategory: string;
  _count: { resources: number };
};

const RESOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  textbook: LuBook,
  video: LuVideo,
  pdf: LuFileText,
  link: LuLink,
  worksheet: LuClipboardList,
  past_paper: LuScrollText,
};

function ResourceIcon({ type }: { type: string }) {
  const Icon = RESOURCE_ICONS[type] ?? LuFile;
  return <Icon className="h-5 w-5" />;
}

function isReadable(resource: SubjectResource) {
  // A locked resource arrives with its url stripped, so there is nothing to
  // open and nothing to read.
  if (resource.locked) return false;
  return resource.url.endsWith(".pdf") || resource.url.startsWith("/resources/");
}

function ResourceCard({
  resource,
  onRead,
}: {
  resource: SubjectResource;
  onRead?: (resource: SubjectResource) => void;
}) {
  const readable = isReadable(resource);

  const content = (
    <>
      <span className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {readable ? <LuBookOpenText className="h-5 w-5" /> : <ResourceIcon type={resource.resourceType} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {resource.title}
          </h4>
          {!resource.isFree && <Badge variant="amber">Premium</Badge>}
        </div>
        {resource.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted">{resource.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Badge variant="neutral" className="capitalize">
            {resource.resourceType.replace("_", " ")}
          </Badge>
          {resource.author && <span className="text-[11px] text-muted">by {resource.author}</span>}
          {readable ? (
            <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-primary">
              <LuBookOpenText className="h-3 w-3" />
              Read
            </span>
          ) : (
            <LuExternalLink className="ml-auto h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </div>
    </>
  );

  // Locked resources keep their place on the shelf — they are the reason to
  // upgrade — but lead to the billing page rather than to a url they do not have.
  if (resource.locked) {
    return (
      <Link
        href="/settings/billing"
        className="card card-interactive group flex items-start gap-4 p-4 opacity-75"
        title="Upgrade to Premium to open this resource"
      >
        {content}
      </Link>
    );
  }

  if (readable && onRead) {
    return (
      <button
        onClick={() => onRead(resource)}
        className="card card-interactive group flex items-start gap-4 p-4 text-left"
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-interactive group flex items-start gap-4 p-4"
    >
      {content}
    </a>
  );
}

/**
 * The subject shelf arrives from the server already filtered to the student's
 * track. Only the per-subject resource list is fetched on demand, since it is
 * driven by what the student clicks.
 */
export function LibraryView({ subjects }: { subjects: Subject[] }) {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [resources, setResources] = useState<SubjectResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [pdfViewer, setPdfViewer] = useState<{ file: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openSubject = useCallback(async (subject: Subject) => {
    setSelectedSubject(subject);
    setResources([]);
    setResourcesLoading(true);
    try {
      const res = await fetch(`/api/library?subjectId=${subject.id}`);
      const data = await res.json();
      setResources(Array.isArray(data) ? data : []);
    } catch {
      setResources([]);
      setError("Could not load these resources. Please try again.");
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  const handleRead = useCallback((resource: SubjectResource) => {
    setPdfViewer({ file: resource.url, title: resource.title });
  }, []);

  const grouped = new Map<string, Subject[]>();
  for (const subject of subjects) {
    const list = grouped.get(subject.trackCategory) ?? [];
    list.push(subject);
    grouped.set(subject.trackCategory, list);
  }

  // Resource detail view
  if (selectedSubject) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => { setSelectedSubject(null); setPdfViewer(null); }}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <LuArrowLeft className="h-4 w-4" />
          Back to library
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl border text-xs font-bold",
                TRACK_COLORS[selectedSubject.trackCategory as TrackCategory],
              )}
            >
              {selectedSubject.code}
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {selectedSubject.name}
              </h1>
              <p className="text-sm text-muted">
                {pdfViewer ? "Reading" : "Textbooks, videos, and study materials"}
              </p>
            </div>
          </div>
          {selectedSubject.description && !pdfViewer && (
            <p className="mt-3 max-w-2xl text-sm text-muted">{selectedSubject.description}</p>
          )}
        </div>

        {pdfViewer ? (
          <PDFReader
            file={pdfViewer.file}
            title={pdfViewer.title}
            onClose={() => setPdfViewer(null)}
          />
        ) : resourcesLoading ? (
          <Spinner className="py-16" />
        ) : resources.length === 0 ? (
          <EmptyState
            tone="primary"
            icon={<LuBookOpen className="h-6 w-6" />}
            title={`No resources yet for ${selectedSubject.name}`}
            description="Check back later — new materials are being added regularly."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {resources.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} onRead={handleRead} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Subject grid view
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Library"
        description="Browse textbooks and study materials for your subjects."
      />

      {error ? (
        <EmptyState
          tone="primary"
          icon={<LuBook className="h-6 w-6" />}
          title="Something went wrong"
          description={error}
          action={
            <button onClick={() => window.location.reload()} className={buttonClass("secondary", "md")}>
              Reload page
            </button>
          }
        />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={<LuInbox className="h-6 w-6" />}
          title="No subjects available"
          description="Please set your track in settings to see relevant subjects."
        />
      ) : (
        Array.from(grouped.entries()).map(([category, list]) => (
          <div key={category} className="mb-10">
            <h2 className="section-label mb-4">
              {TRACK_LABELS[category as TrackCategory]} Subjects
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => openSubject(subject)}
                  className="card card-interactive flex items-center gap-4 p-4 text-left"
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border text-xs font-bold",
                      TRACK_COLORS[subject.trackCategory as TrackCategory],
                    )}
                  >
                    {subject.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {subject.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {subject._count.resources === 0
                        ? "No resources yet"
                        : `${subject._count.resources} resource${subject._count.resources === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
