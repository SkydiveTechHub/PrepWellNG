"use client";

import { useState } from "react";
import { LuList, LuNetwork } from "react-icons/lu";
import { cn } from "@/lib/utils";

// Learning Path Engine — subject curriculum toggle (list / knowledge graph).
// The server page supplies both: the graph canvas and the term-grouped list.

export function CurriculumViewToggle({
  graph,
  children,
}: {
  graph: React.ReactNode;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"list" | "graph">("list");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-label mb-0">Curriculum</h2>
        <div
          className="flex rounded-xl border border-border bg-card p-1"
          role="tablist"
          aria-label="Curriculum view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
              view === "list"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted hover:text-foreground",
            )}
          >
            <LuList className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "graph"}
            onClick={() => setView("graph")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
              view === "graph"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted hover:text-foreground",
            )}
          >
            <LuNetwork className="h-3.5 w-3.5" />
            Graph
          </button>
        </div>
      </div>
      {view === "list" ? children : graph}
    </div>
  );
}
