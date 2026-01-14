'use client';

import * as React from 'react';
import { Info, Box, Cpu, Triangle, FileCode, Clock, Gauge, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CADAssembly, CADPart, FrameMetrics, QualityPreset } from '@/lib/viewer/types';

interface MetadataPanelProps {
  assembly: CADAssembly | null;
  selectedParts: Set<string>;
  metrics: FrameMetrics | null;
  quality: QualityPreset;
  gesturesEnabled: boolean;
  gestureFps: number;
}

function MetadataSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-800/50 pb-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-3.5 text-amber-500" />
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {title}
        </h3>
      </div>
      <div className="space-y-1.5 pl-5">
        {children}
      </div>
    </div>
  );
}

function MetadataRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className={cn('font-mono text-zinc-200', valueClass)}>{value}</span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function MetadataPanel({
  assembly,
  selectedParts,
  metrics,
  quality,
  gesturesEnabled,
  gestureFps,
}: MetadataPanelProps) {
  const selectedPart = React.useMemo(() => {
    if (selectedParts.size !== 1 || !assembly) return null;
    const partId = Array.from(selectedParts)[0];
    return assembly.parts.find(p => p.id === partId) ?? null;
  }, [selectedParts, assembly]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        {/* Performance Metrics */}
        {metrics && (
          <MetadataSection title="Performance" icon={Gauge}>
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">FPS</span>
                <span className={cn(
                  'font-mono font-medium',
                  metrics.fps >= 55 ? 'text-emerald-400' : 
                  metrics.fps >= 40 ? 'text-amber-400' : 'text-red-400'
                )}>
                  {Math.round(metrics.fps)}
                </span>
              </div>
              <Progress 
                value={Math.min(100, (metrics.fps / 60) * 100)} 
                className="mt-1 h-1.5"
              />
            </div>
            <MetadataRow label="Frame Time" value={`${metrics.frameTime.toFixed(1)} ms`} />
            <MetadataRow label="Draw Calls" value={metrics.drawCalls} />
            <MetadataRow label="Triangles" value={formatNumber(metrics.triangles)} />
            <MetadataRow label="Quality" value={
              <Badge variant="outline" className="h-5 text-[10px] capitalize">
                {quality}
              </Badge>
            } />
          </MetadataSection>
        )}

        {/* Gesture Status */}
        {gesturesEnabled && (
          <MetadataSection title="Gestures" icon={Cpu}>
            <MetadataRow label="Status" value={
              <Badge variant="outline" className="h-5 bg-amber-500/10 text-[10px] text-amber-400">
                Active
              </Badge>
            } />
            <MetadataRow label="Tracking FPS" value={`${gestureFps}`} />
          </MetadataSection>
        )}

        {/* Assembly Info */}
        {assembly && (
          <MetadataSection title="Assembly" icon={FileCode}>
            <MetadataRow label="Name" value={assembly.name} />
            <MetadataRow label="Format" value={assembly.format.toUpperCase()} />
            <MetadataRow label="Parts" value={assembly.parts.length} />
            <MetadataRow label="Triangles" value={formatNumber(assembly.totalTriangles)} />
            <MetadataRow label="File Size" value={formatBytes(assembly.fileSize)} />
            {assembly.metadata?.units && (
              <MetadataRow label="Units" value={assembly.metadata.units} />
            )}
          </MetadataSection>
        )}

        {/* Selected Part Info */}
        {selectedPart && (
          <MetadataSection title="Selected Part" icon={Box}>
            <MetadataRow label="Name" value={selectedPart.name} />
            <MetadataRow label="ID" value={
              <span className="max-w-[100px] truncate">{selectedPart.id.slice(0, 8)}...</span>
            } />
            {selectedPart.metadata?.partNumber && (
              <MetadataRow label="Part Number" value={selectedPart.metadata.partNumber} />
            )}
            {selectedPart.metadata?.material && (
              <MetadataRow label="Material" value={selectedPart.metadata.material} />
            )}
            {selectedPart.metadata?.weight && (
              <MetadataRow label="Weight" value={`${selectedPart.metadata.weight} kg`} />
            )}
            {selectedPart.metadata?.manufacturer && (
              <MetadataRow label="Manufacturer" value={selectedPart.metadata.manufacturer} />
            )}
            
            {/* Custom Properties */}
            {selectedPart.metadata?.properties && Object.keys(selectedPart.metadata.properties).length > 0 && (
              <div className="mt-2 border-t border-zinc-800 pt-2">
                <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                  Custom Properties
                </span>
                <div className="mt-1 space-y-1">
                  {Object.entries(selectedPart.metadata.properties).map(([key, value]) => (
                    <MetadataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}
          </MetadataSection>
        )}

        {/* Multiple Selection */}
        {selectedParts.size > 1 && (
          <MetadataSection title="Selection" icon={Box}>
            <MetadataRow label="Selected Parts" value={selectedParts.size} />
          </MetadataSection>
        )}

        {/* Empty State */}
        {!assembly && (
          <div className="flex h-32 items-center justify-center">
            <p className="text-center text-xs text-zinc-500">
              No model loaded
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
