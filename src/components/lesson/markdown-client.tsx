"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import {
  InlineMarkdownBase,
  MarkdownBase,
  type RenderMath,
} from "@/components/lesson/markdown-base";
import { mathKey, type MathDictionary } from "@/lib/math-dictionary";

// Client binding of the markdown renderer.
//
// Renders exactly what markdown.tsx renders, but reads each formula's markup
// out of a dictionary the server already built (`buildMathDictionary` in
// src/lib/latex.ts) instead of importing KaTeX. That keeps ~260KB of renderer
// off the lesson player and the flashcard deck -- the two routes students
// spend the most time on, on mostly metered mobile data.
//
// Every client component that renders lesson prose should import from here.

const MathContext = createContext<MathDictionary>({});

/**
 * Supplies server-rendered formula markup to a client subtree.
 *
 * Wrap the root of any client tree that renders lesson prose, passing the
 * dictionary built for the same payload the tree renders. Without a provider
 * the components still work — they fall back to loading KaTeX in the browser
 * (see below) — so a surface that has no server payload to precompute from
 * stays correct, just heavier.
 */
export function MathProvider({
  dictionary,
  children,
}: {
  dictionary: MathDictionary;
  children: React.ReactNode;
}) {
  return (
    <MathContext.Provider value={dictionary}>{children}</MathContext.Provider>
  );
}

// ─── Browser fallback ─────────────────────────────────────
//
// One surface genuinely cannot be precomputed: the admin lesson upload form
// previews markdown as it is typed, so its formulas exist only in the browser
// and have never been near the server. Rather than leave maths broken there,
// a miss loads KaTeX on demand -- a single dynamic import, shared process-wide,
// fetched only by the surfaces that actually miss. Students never do: their
// dictionary is built from the same payload they render.

type Katex = typeof import("katex").default;

let katexModule: Katex | null = null;
let katexLoad: Promise<void> | null = null;

function loadKatex(): Promise<void> {
  katexLoad ??= import("katex").then((mod) => {
    katexModule = mod.default;
  });
  return katexLoad;
}

/** Matches `renderLatex`'s options exactly — see src/lib/latex.ts for why. */
function renderWithLoadedKatex(tex: string, displayMode: boolean): string {
  try {
    return (
      katexModule?.renderToString(tex, {
        displayMode,
        throwOnError: false,
        trust: false,
      }) ?? escapeHtml(tex)
    );
  } catch {
    return escapeHtml(tex);
  }
}

/**
 * The literal source, safe to inject.
 *
 * This is the placeholder shown for the instant between a dictionary miss and
 * KaTeX arriving. It is the one string on this path that did *not* come out of
 * KaTeX, so unlike the rest it has to be escaped: the content is authored by
 * upload and a formula reading `$<img onerror=…>$` must render as those
 * characters, not as a tag.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function useRenderMath(): RenderMath {
  const dictionary = useContext(MathContext);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const missed = useRef(false);

  const renderMath = useCallback<RenderMath>(
    (tex, displayMode) => {
      const hit = dictionary[mathKey(tex, displayMode)];
      if (hit !== undefined) return hit;
      if (katexModule) return renderWithLoadedKatex(tex, displayMode);
      // Flagged rather than loaded here: firing an import from inside render
      // would be a side effect on a path React may run more than once.
      missed.current = true;
      return escapeHtml(tex);
    },
    [dictionary],
  );

  useEffect(() => {
    if (!missed.current || katexModule) return;
    missed.current = false;
    void loadKatex().then(rerender);
  });

  return renderMath;
}

/** Client counterpart of `<InlineMarkdown>`. Same output, no bundled KaTeX. */
export function InlineMarkdown({ content }: { content: string }) {
  const renderMath = useRenderMath();
  return <InlineMarkdownBase content={content} renderMath={renderMath} />;
}

/** Client counterpart of `<Markdown>`. Same output, no bundled KaTeX. */
export function Markdown({ content }: { content: string }) {
  const renderMath = useRenderMath();
  return <MarkdownBase content={content} renderMath={renderMath} />;
}
