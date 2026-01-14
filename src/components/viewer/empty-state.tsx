'use client';

import * as React from 'react';
import { Upload, FileBox, Layers, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  onOpenFile: () => void;
  isDragging?: boolean;
}

export function EmptyState({ onOpenFile, isDragging }: EmptyStateProps) {
  return (
    <div 
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center transition-colors',
        isDragging && 'bg-amber-500/5'
      )}
    >
      {/* Drop Zone Visual */}
      <div className={cn(
        'mb-8 flex flex-col items-center rounded-2xl border-2 border-dashed p-12 transition-all',
        isDragging 
          ? 'border-amber-500 bg-amber-500/10 scale-105' 
          : 'border-zinc-800 hover:border-zinc-700'
      )}>
        <div className={cn(
          'mb-4 flex size-16 items-center justify-center rounded-full transition-colors',
          isDragging ? 'bg-amber-500/20' : 'bg-zinc-800'
        )}>
          {isDragging ? (
            <Upload className="size-8 text-amber-500" />
          ) : (
            <FileBox className="size-8 text-zinc-500" />
          )}
        </div>
        
        <h2 className="mb-2 text-lg font-medium text-white">
          {isDragging ? 'Drop to load' : 'No model loaded'}
        </h2>
        
        <p className="mb-6 max-w-sm text-center text-sm text-zinc-500">
          Drag and drop a CAD file or click to browse.
          Supports STL, OBJ, and GLTF formats.
        </p>

        <Button 
          onClick={onOpenFile}
          className="bg-amber-600 hover:bg-amber-500 text-white"
        >
          <Upload className="mr-2 size-4" />
          Open CAD File
        </Button>
      </div>

      {/* Feature Highlights */}
      <div className="grid max-w-2xl grid-cols-3 gap-8">
        <FeatureCard
          icon={Layers}
          title="Multi-Part Support"
          description="View complex assemblies with part hierarchy"
        />
        <FeatureCard
          icon={Hand}
          title="Gesture Control"
          description="Navigate with hand gestures using MediaPipe"
        />
        <FeatureCard
          icon={FileBox}
          title="Large Files"
          description="Optimized for 500MB+ assemblies"
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-zinc-800">
        <Icon className="size-5 text-zinc-400" />
      </div>
      <h3 className="mb-1 text-sm font-medium text-zinc-200">{title}</h3>
      <p className="text-xs text-zinc-500">{description}</p>
    </div>
  );
}
