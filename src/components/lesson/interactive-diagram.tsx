"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LuInfo, LuScan } from "react-icons/lu";
import type { DiagramBlock } from "@/lib/lesson-engine";

export function InteractiveDiagram({ block }: { block: DiagramBlock }) {
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const active = block.hotspots.find((h) => h.id === activeHotspot) ?? null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-primary-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <LuScan className="h-4 w-4 flex-shrink-0 text-primary" />
          <p className="truncate text-sm font-semibold text-foreground">
            {block.title ?? "Diagram"}
          </p>
        </div>
        {block.hotspots.length > 0 && (
          <span className="flex-shrink-0 rounded-full bg-card px-2.5 py-0.5 text-[11px] font-semibold text-muted">
            Tap a part
          </span>
        )}
      </div>

      {block.svg ? (
        <div
          className="diagram-svg flex items-center justify-center p-4"
          dangerouslySetInnerHTML={{ __html: block.svg }}
        />
      ) : (
        <div className="flex h-32 items-center justify-center text-xs text-muted">
          Diagram coming soon
        </div>
      )}

      {block.caption && (
        <p className="px-4 pb-3 text-xs italic leading-relaxed text-muted">
          {block.caption}
        </p>
      )}

      {block.hotspots.length > 0 && (
        <div className="border-t border-border p-4">
          <div className="flex flex-wrap gap-2">
            {block.hotspots.map((hotspot) => {
              const isActive = hotspot.id === activeHotspot;
              return (
                <button
                  key={hotspot.id}
                  type="button"
                  onClick={() => setActiveHotspot(isActive ? null : hotspot.id)}
                  aria-pressed={isActive}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-foreground hover:border-primary/40",
                  )}
                >
                  {hotspot.label}
                </button>
              );
            })}
          </div>

          <div
            aria-live="polite"
            className={cn(
              "mt-3 rounded-xl px-3.5 py-3 text-sm leading-relaxed transition-all",
              active ? "bg-primary-soft text-foreground animate-fade-in" : "bg-secondary/40 text-muted",
            )}
          >
            {active ? (
              <>
                <span className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-primary">
                  <LuInfo className="h-3.5 w-3.5" />
                  {active.label}
                </span>
                {active.text}
              </>
            ) : (
              "Select a labelled part above to see what it does."
            )}
          </div>
        </div>
      )}
    </div>
  );
}
