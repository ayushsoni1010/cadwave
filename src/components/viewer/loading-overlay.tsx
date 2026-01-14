'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { LoadingProgress } from '@/lib/viewer/types';
import { cn } from '@/lib/utils';

interface LoadingOverlayProps {
  progress: LoadingProgress | null;
}

export function LoadingOverlay({ progress }: LoadingOverlayProps) {
  if (!progress || progress.stage === 'complete') return null;

  const isError = progress.stage === 'error';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm">
      <div className="w-80 rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        {/* Icon */}
        <div className="mb-4 flex justify-center">
          {isError ? (
            <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10">
              <span className="text-2xl">⚠️</span>
            </div>
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
              <Loader2 className="size-6 animate-spin text-amber-500" />
            </div>
          )}
        </div>

        {/* Stage */}
        <h3 className={cn(
          'mb-2 text-center text-sm font-medium',
          isError ? 'text-red-400' : 'text-white'
        )}>
          {progress.stage === 'fetching' && 'Loading File'}
          {progress.stage === 'parsing' && 'Parsing Geometry'}
          {progress.stage === 'optimizing' && 'Optimizing'}
          {progress.stage === 'building' && 'Building Scene'}
          {progress.stage === 'error' && 'Error'}
        </h3>

        {/* Message */}
        <p className="mb-4 text-center text-xs text-zinc-400">
          {progress.message}
        </p>

        {/* Progress Bar */}
        {!isError && (
          <div className="space-y-2">
            <Progress value={progress.progress} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>
                {progress.bytesLoaded !== undefined && progress.bytesTotal
                  ? `${formatBytes(progress.bytesLoaded)} / ${formatBytes(progress.bytesTotal)}`
                  : ''}
              </span>
              <span>{Math.round(progress.progress)}%</span>
            </div>
          </div>
        )}

        {/* Part Count */}
        {progress.partsLoaded !== undefined && progress.partsTotal && (
          <p className="mt-2 text-center text-[10px] text-zinc-500">
            {progress.partsLoaded} / {progress.partsTotal} parts
          </p>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
