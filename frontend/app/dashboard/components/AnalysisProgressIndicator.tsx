'use client';

import { AnalysisProgress } from '@/components/AnalysisProgress';

export interface AnalysisProgressIndicatorProps {
  analysisProgress: Record<number, { pct: number; title: string; isLocal: boolean }>;
}

export default function AnalysisProgressIndicator({
  analysisProgress,
}: AnalysisProgressIndicatorProps) {
  if (Object.keys(analysisProgress).length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9990] w-72 space-y-2">
      {Object.entries(analysisProgress).map(([id, info]) => (
        <AnalysisProgress
          key={id}
          trackTitle={info.title}
          progress={info.pct}
          isLocal={info.isLocal}
          queueSize={Object.keys(analysisProgress).length}
          queuePosition={Object.keys(analysisProgress).indexOf(id) + 1}
        />
      ))}
    </div>
  );
}
