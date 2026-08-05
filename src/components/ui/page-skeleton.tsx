/**
 * Shared streaming placeholder. Server pages that query on every request stream
 * this immediately instead of holding a blank screen until the database answers
 * — which on a cold Supabase pooler could be seconds.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-fade-in space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="space-y-2">
        <div className="skeleton h-7 w-52" />
        <div className="skeleton h-4 w-72" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 md:p-5">
            <div className="skeleton mb-3 h-10 w-10 rounded-xl" />
            <div className="skeleton h-7 w-16" />
            <div className="skeleton mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card flex items-center gap-4 p-4">
            <div className="skeleton h-11 w-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
