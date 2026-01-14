'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { FrameMetrics, QualityPreset } from '@/lib/viewer/types';

interface StatusBarProps {
  metrics: FrameMetrics | null;
  quality: QualityPreset;
  triangleCount: number;
  partCount: number;
  selectedCount: number;
  gesturesEnabled: boolean;
  gestureStatus: string;
}

export function StatusBar({
  metrics,
  quality,
  triangleCount,
  partCount,
  selectedCount,
  gesturesEnabled,
  gestureStatus,
}: StatusBarProps) {
  const fps = metrics?.fps ?? 0;
  
  return (
    <div className="flex h-6 items-center gap-4 border-t border-zinc-800/50 bg-zinc-950/80 px-3 text-[10px] text-zinc-500">
      {/* FPS Indicator */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'size-1.5 rounded-full',
            fps >= 55 ? 'bg-emerald-500' :
            fps >= 40 ? 'bg-amber-500' : 'bg-red-500'
          )}
        />
        <span className="font-mono">
          {Math.round(fps)} FPS
        </span>
      </div>

      {/* Quality */}
      <span className="font-mono uppercase">{quality}</span>

      {/* Separator */}
      <div className="h-3 w-px bg-zinc-800" />

      {/* Stats */}
      <span>{formatNumber(triangleCount)} tris</span>
      <span>{partCount} parts</span>
      
      {selectedCount > 0 && (
        <>
          <div className="h-3 w-px bg-zinc-800" />
          <span className="text-amber-500">{selectedCount} selected</span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Gesture Status */}
      {gesturesEnabled && (
        <span className="text-amber-500">
          🖐️ {gestureStatus}
        </span>
      )}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}
