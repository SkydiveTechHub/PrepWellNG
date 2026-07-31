"use client";

import { useEffect, useState, useCallback } from "react";
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
  LuBookOpen,
  LuLoader,
  LuBookOpenText,
} from "react-icons/lu";
import { TRACK_LABELS, TRACK_COLORS, type TrackCategory } from "@/lib/subjects";
import dynamic from "next/dynamic";

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
  return <Icon className="w-5 h-5" />;
}

function isReadable(resource: SubjectResource) {
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
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
        {readable ? <LuBookOpenText className="w-5 h-5" /> : <ResourceIcon type={resource.resourceType} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-foreground text-sm truncate group-hover:text-primary transition-colors">
            {resource.title}
          </h4>
          {!resource.isFree && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">
              Premium
            </span>
          )}
        </div>
        {resource.description && (
          <p className="text-xs text-muted mt-1 line-clamp-2">
            {resource.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[11px] font-medium capitalize text-muted bg-secondary px-2 py-0.5 rounded">
            {resource.resourceType.replace("_", " ")}
          </span>
          {resource.author && (
            <span className="text-[11px] text-muted">by {resource.author}</span>
          )}
          {readable ? (
            <span className="text-[11px] font-medium text-primary ml-auto flex items-center gap-1">
              <LuBookOpenText className="w-3 h-3" />
              Read
            </span>
          ) : (
            <LuExternalLink className="w-3.5 h-3.5 text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </div>
    </>
  );

  if (readable && onRead) {
    return (
      <button
        onClick={() => onRead(resource)}
        className="flex items-start gap-4 bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all group text-left w-full"
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
      className="flex items-start gap-4 bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all group"
    >
      {content}
    </a>
  );
}

export default function LibraryPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [resources, setResources] = useState<SubjectResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/library");
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setSubjects(Array.isArray(data) ? data : []);
        if (!Array.isArray(data)) setError("The library returned an unexpected response.");
      } catch {
        if (!cancelled) setError("Could not load the library. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  const [pdfViewer, setPdfViewer] = useState<{ file: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRead = useCallback((resource: SubjectResource) => {
    setPdfViewer({ file: resource.url, title: resource.title });
  }, []);

  const grouped = new Map<string, Subject[]>();
  for (const subject of subjects) {
    const list = grouped.get(subject.trackCategory) ?? [];
    list.push(subject);
    grouped.set(subject.trackCategory, list);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LuLoader className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Resource detail view
  if (selectedSubject) {
    return (
      <div>
        <button
          onClick={() => { setSelectedSubject(null); setPdfViewer(null); }}
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-6"
        >
          <LuArrowLeft className="w-4 h-4" />
          Back to library
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold border ${TRACK_COLORS[selectedSubject.trackCategory as TrackCategory]}`}
            >
              {selectedSubject.code}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {selectedSubject.name}
              </h1>
              <p className="text-sm text-muted mt-0.5">
                {pdfViewer ? "Reading" : "Textbooks, videos, and study materials"}
              </p>
            </div>
          </div>
          {selectedSubject.description && !pdfViewer && (
            <p className="text-sm text-muted mt-3 max-w-2xl">
              {selectedSubject.description}
            </p>
          )}
        </div>

        {pdfViewer ? (
          <PDFReader
            file={pdfViewer.file}
            title={pdfViewer.title}
            onClose={() => setPdfViewer(null)}
          />
        ) : resourcesLoading ? (
          <div className="flex items-center justify-center py-16">
            <LuLoader className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : resources.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <LuBookOpen className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-sm text-muted">
              No resources available yet for {selectedSubject.name}.
            </p>
            <p className="text-xs text-muted mt-1">
              Check back later — new materials are being added regularly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Library</h1>
        <p className="text-muted mt-1">
          Browse textbooks and study materials for your subjects.
        </p>
      </div>

      {error ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <LuBook className="w-12 h-12 text-danger mx-auto mb-4" />
          <p className="text-sm font-medium text-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs font-medium text-primary hover:underline"
          >
            Reload page
          </button>
        </div>
      ) : subjects.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <LuBook className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-sm text-muted">
            No subjects available. Please set your track in settings.
          </p>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([category, list]) => (
          <div key={category} className="mb-10">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
              {TRACK_LABELS[category as TrackCategory]} Subjects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => openSubject(subject)}
                  className="flex items-center gap-4 bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all text-left"
                >
                  <span
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold border flex-shrink-0 ${TRACK_COLORS[subject.trackCategory as TrackCategory]}`}
                  >
                    {subject.code}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground text-sm truncate">
                      {subject.name}
                    </h3>
                    <p className="text-xs text-muted mt-1">
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
