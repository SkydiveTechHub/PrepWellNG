"use client";

import Link from "next/link";
import {
  LuBookOpen,
  LuCheck,
  LuLock,
  LuSparkles,
  LuZap,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

// Learning Path Engine — graph view (spec Stage 0). Renders a subject's topics
// as nodes layered by prerequisite depth, with arrows for edges. Node state
// colours carry the signal: LOCKED / READY / STARTED / DECAYED / MASTERED.

export type GraphNodeState = "LOCKED" | "READY" | "STARTED" | "DECAYED" | "MASTERED";

export type GraphViewNode = {
  id: string;
  title: string;
  slug: string;
  orderIndex: number;
  state: GraphNodeState;
  mastery: number;
  isNext: boolean;
};

export type GraphViewEdge = { from: string; to: string };

type GraphViewProps = {
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  subjectSlug: string;
  mastered: number;
  ready: number;
  due: number;
  total: number;
};

const NODE_W = 180;
const NODE_H = 60;
const GAP_X = 72;
const GAP_Y = 14;
const PAD = 12;

const NODE_STYLES: Record<GraphNodeState, string> = {
  LOCKED: "border-border bg-secondary text-muted",
  READY: "border-tone-blue-line bg-tone-blue-soft text-tone-blue-ink",
  STARTED: "border-tone-amber-line bg-tone-amber-soft text-tone-amber-ink",
  DECAYED: "border-tone-orange-line bg-tone-orange-soft text-tone-orange-ink",
  MASTERED: "border-tone-green-line bg-tone-green-soft text-tone-green-ink",
};

const STATE_META: Record<GraphNodeState, { label: string; swatch: string }> = {
  LOCKED: { label: "Locked", swatch: "bg-muted" },
  READY: { label: "Ready", swatch: "bg-blue-400" },
  STARTED: { label: "In progress", swatch: "bg-amber-400" },
  DECAYED: { label: "Due for revision", swatch: "bg-orange-400" },
  MASTERED: { label: "Mastered", swatch: "bg-green-500" },
};

export function GraphView({
  nodes,
  edges,
  subjectSlug,
  mastered,
  ready,
  due,
  total,
}: GraphViewProps) {
  // Longest-path layering: a node's column is one deeper than its deepest
  // prerequisite, so prerequisites always sit to the left of dependents.
  const levels = new Map<string, number>();
  for (const node of nodes) levels.set(node.id, 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      const fromLevel = levels.get(edge.from) ?? 0;
      const toLevel = levels.get(edge.to) ?? 0;
      if (fromLevel + 1 > toLevel) {
        levels.set(edge.to, fromLevel + 1);
        changed = true;
      }
    }
  }

  const columns = new Map<number, GraphViewNode[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    const column = columns.get(level) ?? [];
    column.push(node);
    columns.set(level, column);
  }
  for (const column of columns.values()) {
    column.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const maxLevel = [...columns.keys()].reduce((m, level) => Math.max(m, level), 0);
  const width = PAD * 2 + maxLevel * (NODE_W + GAP_X) + NODE_W;
  const maxColumn = [...columns.values()].reduce(
    (m, column) => Math.max(m, column.length),
    0,
  );
  const height = PAD * 2 + maxColumn * (NODE_H + GAP_Y);

  const xFor = (level: number) => PAD + level * (NODE_W + GAP_X);
  const yFor = (index: number) => PAD + index * (NODE_H + GAP_Y);
  const position = new Map<string, { x: number; y: number }>();
  for (const [level, column] of columns) {
    column.forEach((node, index) =>
      position.set(node.id, { x: xFor(level), y: yFor(index) }),
    );
  }

  return (
    <div className="card overflow-hidden p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          <span className="font-bold text-primary">{mastered}</span> of{" "}
          <span className="font-bold text-foreground">{total}</span> mastered
          {ready > 0 && (
            <>
              {" · "}
              <span className="font-bold text-tone-blue-ink">{ready}</span> ready
            </>
          )}
          {due > 0 && (
            <>
              {" · "}
              <span className="font-bold text-tone-orange-ink">{due}</span> due for
              revision
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {(Object.keys(STATE_META) as GraphNodeState[]).map((state) => (
            <span
              key={state}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"
            >
              <span
                className={cn("h-2.5 w-2.5 rounded-full", STATE_META[state].swatch)}
              />
              {STATE_META[state].label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-xl border border-border bg-background/50 p-2">
        <div className="relative" style={{ width, height }}>
          <svg
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
          >
            <defs>
              <marker
                id="graph-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L0,8 L8,4 z" fill="#94a3b8" />
              </marker>
            </defs>
            {edges.map((edge, index) => {
              const from = position.get(edge.from);
              const to = position.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_H / 2;
              const midX = (x1 + x2) / 2;
              return (
                <path
                  key={index}
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  markerEnd="url(#graph-arrow)"
                />
              );
            })}
          </svg>

          {nodes.map((node) => {
            const pos = position.get(node.id);
            if (!pos) return null;
            return (
              <Link
                key={node.id}
                href={`/classroom/${subjectSlug}/${node.slug}`}
                className={cn(
                  "absolute flex flex-col justify-center rounded-xl border-2 px-3 py-2 shadow-soft transition-transform hover:scale-[1.03] hover:shadow-lift",
                  NODE_STYLES[node.state],
                  node.isNext && "ring-4 ring-primary/30",
                )}
                style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                title={node.title}
              >
                {node.isNext && (
                  <span className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-lift animate-pulse">
                    <LuSparkles className="h-2.5 w-2.5" />
                    Next
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  {node.state === "LOCKED" ? (
                    <LuLock className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : node.state === "MASTERED" ? (
                    <LuCheck className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : node.state === "DECAYED" ? (
                    <LuZap className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : node.state === "STARTED" ? (
                    <LuBookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <LuBookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  )}
                  <span className="truncate text-xs font-bold">{node.title}</span>
                </span>
                <span className="mt-1 text-[11px] font-semibold opacity-80">
                  {node.state === "MASTERED"
                    ? "Mastered"
                    : node.state === "DECAYED"
                      ? `Revision due · ${node.mastery}%`
                      : `${node.mastery}% mastery`}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
