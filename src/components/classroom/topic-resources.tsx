import {
  LuBook,
  LuClipboardList,
  LuExternalLink,
  LuFile,
  LuFileText,
  LuLink,
  LuScrollText,
  LuVideo,
} from "react-icons/lu";
import { selectResources } from "@/lib/classroom";

/**
 * One shape for a resource card regardless of which table it came from.
 * `LessonResource` has `caption` (nullable) instead of `title` and has no
 * `description` — the page maps both into this before it reaches the
 * component, so the component never has to know the difference.
 */
export type ResourceItem = {
  id: string;
  title: string;
  url: string;
  resourceType: string;
  description?: string | null;
};

// Same icon language as the Library (`src/components/library/library-view.tsx`)
// so a student recognises these as the same kind of thing.
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

/**
 * Topic-specific resources win; falling back to the subject's list is better
 * than an empty section, but the heading must say so honestly — `selectResources`
 * (from `src/lib/classroom.ts`) is the single source of truth for that choice,
 * this component only renders what it decides.
 */
export function TopicResources({
  lessonResources,
  subjectResources,
  subjectName,
}: {
  lessonResources: ResourceItem[];
  subjectResources: ResourceItem[];
  subjectName: string;
}) {
  const { items, source } = selectResources(lessonResources, subjectResources);
  if (source === "none") return null;

  const heading = source === "topic" ? "More resources" : `More ${subjectName} resources`;

  return (
    <div className="card mt-6 p-5">
      <h2 className="mb-3 text-sm font-bold tracking-tight text-foreground">{heading}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card card-interactive group flex items-start gap-3 p-4"
          >
            <span className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <ResourceIcon type={item.resourceType} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                {item.title}
              </h3>
              {item.description && (
                <p className="mt-1 line-clamp-2 text-xs text-muted">{item.description}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="chip border border-border bg-card text-[11px] capitalize text-muted">
                  {item.resourceType.replace("_", " ")}
                </span>
                <LuExternalLink className="ml-auto h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
