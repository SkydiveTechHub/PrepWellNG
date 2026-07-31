"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  LuChevronLeft,
  LuChevronRight,
  LuZoomIn,
  LuZoomOut,
  LuArrowLeft,
} from "react-icons/lu";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type PDFReaderProps = {
  file: string;
  title: string;
  onClose: () => void;
};

export default function PDFReader({ file, title, onClose }: PDFReaderProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback(
    (page: number) => {
      setPageNumber((cur) => Math.max(1, Math.min(numPages || 1, page)));
    },
    [numPages],
  );

  // Track container width so pages fit-to-width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard navigation (arrow keys + PageUp/PageDown)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goTo(pageNumber + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(pageNumber - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goTo, pageNumber]);

  // Swipe navigation on touch devices
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 50) {
      if (dx < 0) goTo(pageNumber + 1);
      else goTo(pageNumber - 1);
    }
  };

  const pageWidth = Math.max(320, containerWidth - 32);

  return (
    <div className="bg-card rounded-xl border border-border">
      {/* Toolbar */}
      <div className="sticky top-14 lg:top-0 z-30 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-card rounded-t-xl">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors flex-shrink-0"
          >
            <LuArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to resources</span>
            <span className="sm:hidden">Back</span>
          </button>
          <span className="text-xs text-muted/50 hidden md:inline">|</span>
          <h2 className="text-sm font-medium text-foreground truncate">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted hover:text-foreground disabled:opacity-30"
            disabled={zoom <= 0.5}
            aria-label="Zoom out"
          >
            <LuZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-muted w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted hover:text-foreground disabled:opacity-30"
            disabled={zoom >= 2}
            aria-label="Zoom in"
          >
            <LuZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            onClick={() => goTo(pageNumber - 1)}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted hover:text-foreground disabled:opacity-30"
            disabled={pageNumber <= 1}
            aria-label="Previous page"
          >
            <LuChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1">
            <input
              type="number"
              value={pageNumber}
              min={1}
              max={numPages || 1}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 1 && v <= (numPages || 1)) goTo(v);
              }}
              className="w-9 text-center text-[11px] bg-secondary rounded border-none py-0.5 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              aria-label="Current page"
            />
            <span className="text-[11px] text-muted">/ {numPages || "—"}</span>
          </div>

          <button
            onClick={() => goTo(pageNumber + 1)}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted hover:text-foreground disabled:opacity-30"
            disabled={pageNumber >= numPages}
            aria-label="Next page"
          >
            <LuChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Document area — flows naturally with the page, never truncated */}
      <div ref={containerRef} className="bg-[#ecece6]">
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="px-4 py-6 flex flex-col items-center"
        >
          {loading && (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {loadError ? (
            <div className="py-20 text-center">
              <p className="text-sm text-muted">Failed to load this PDF.</p>
              <button
                onClick={onClose}
                className="mt-4 text-xs font-medium text-primary hover:underline"
              >
                Back to resources
              </button>
            </div>
          ) : (
            <Document
              file={file}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                setLoading(false);
              }}
              onLoadError={() => {
                setLoadError(true);
                setLoading(false);
              }}
            >
              <Page
                pageNumber={pageNumber}
                width={pageWidth * zoom}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="[&>canvas]:!max-w-none shadow-lg rounded-sm"
              />
            </Document>
          )}

          {/* Bottom navigation */}
          {!loadError && numPages > 0 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => goTo(pageNumber - 1)}
                disabled={pageNumber <= 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:border-primary/30 disabled:opacity-30 disabled:hover:border-border transition-colors"
              >
                <LuChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="text-xs text-muted tabular-nums">
                {pageNumber} of {numPages}
              </span>
              <button
                onClick={() => goTo(pageNumber + 1)}
                disabled={pageNumber >= numPages}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:border-primary/30 disabled:opacity-30 disabled:hover:border-border transition-colors"
              >
                Next
                <LuChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
