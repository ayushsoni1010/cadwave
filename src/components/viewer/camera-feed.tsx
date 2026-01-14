'use client';

import * as React from 'react';
import { Video, VideoOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  onClose: () => void;
}

export function CameraFeed({ videoRef, isActive, onClose }: CameraFeedProps) {
  const [isMinimized, setIsMinimized] = React.useState(false);
  
  if (!isActive) return null;
  
  return (
    <div
      className={cn(
        'absolute bottom-4 right-4 z-40 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl transition-all',
        isMinimized ? 'w-48 h-36' : 'w-80 h-60'
      )}
    >
      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-2">
        <div className="flex items-center gap-2">
          <Video className="size-3.5 text-amber-500" />
          <span className="text-xs font-medium text-zinc-300">Gesture Camera</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsMinimized(!isMinimized)}
            className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
          >
            {isMinimized ? (
              <Video className="size-3" />
            ) : (
              <VideoOff className="size-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
      
      {/* Video Feed */}
      <div className="relative h-[calc(100%-2rem)] bg-zinc-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        
        {/* Overlay when minimized */}
        {isMinimized && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
            <Video className="size-8 text-zinc-600" />
          </div>
        )}
      </div>
    </div>
  );
}
