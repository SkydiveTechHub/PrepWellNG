import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PerformanceTabs } from "@/components/performance/performance-tabs";

export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Performance"
        description="Track your progress, see your grades, and identify topics that need more attention."
      />
      <PerformanceTabs />
      {children}
    </div>
  );
}
