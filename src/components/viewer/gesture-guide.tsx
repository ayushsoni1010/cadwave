'use client';

import * as React from 'react';
import { Hand, RotateCw, Move, ZoomIn, Box, RotateCcw, Pointer, Grip } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info } from 'lucide-react';

interface Gesture {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  handPose: string;
  action: string;
}

const gestures: Gesture[] = [
  {
    name: 'Rotate',
    description: 'Open palm or three fingers extended',
    icon: RotateCw,
    handPose: 'Open palm',
    action: 'Orbit around the model',
  },
  {
    name: 'Pan',
    description: 'Index and middle fingers extended',
    icon: Move,
    handPose: 'Two fingers (peace sign)',
    action: 'Move the camera position',
  },
  {
    name: 'Zoom In',
    description: 'Pinch thumb and index finger together',
    icon: ZoomIn,
    handPose: 'Pinch gesture',
    action: 'Zoom closer to the model',
  },
  {
    name: 'Zoom Out',
    description: 'Spread thumb and index finger apart',
    icon: ZoomIn,
    handPose: 'Spread fingers',
    action: 'Zoom away from the model',
  },
  {
    name: 'Explode',
    description: 'Spread all fingers wide',
    icon: Box,
    handPose: 'Open hand, fingers spread',
    action: 'Separate assembly parts',
  },
  {
    name: 'Reset View',
    description: 'Make a fist',
    icon: RotateCcw,
    handPose: 'Closed fist',
    action: 'Reset camera to default position',
  },
  {
    name: 'Select Part',
    description: 'Point with index finger',
    icon: Pointer,
    handPose: 'Index finger extended',
    action: 'Select a part in the model',
  },
  {
    name: 'Isolate',
    description: 'Thumb and pinky extended (hang loose)',
    icon: Grip,
    handPose: 'Thumb + pinky out',
    action: 'Show only selected parts',
  },
];

interface GestureGuideProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GestureGuide({ isOpen, onOpenChange }: GestureGuideProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 bg-zinc-950 border-zinc-800">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-white">
            <Hand className="size-5 text-amber-500" />
            Gesture Controls
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-5rem)] mt-4">
          <div className="space-y-4 pr-4">
            {/* Introduction */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm text-zinc-300">
                Use hand gestures to control the 3D viewer. Position your hand in front of your camera and make the gestures below.
              </p>
            </div>
            
            {/* Gesture List */}
            {gestures.map((gesture, index) => {
              const Icon = gesture.icon;
              return (
                <div
                  key={gesture.name}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <Icon className="size-5 text-amber-500" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-white">{gesture.name}</h3>
                        <Badge variant="outline" className="h-5 text-[10px]">
                          {index + 1}
                        </Badge>
                      </div>
                      
                      <p className="text-xs text-zinc-400">{gesture.description}</p>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500">Hand Pose:</span>
                          <span className="text-zinc-300">{gesture.handPose}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500">Action:</span>
                          <span className="text-amber-400">{gesture.action}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Tips */}
            <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                <Info className="size-4 text-amber-500" />
                Tips
              </h4>
              <ul className="space-y-1.5 text-xs text-zinc-400">
                <li>• Ensure good lighting for best gesture detection</li>
                <li>• Keep your hand in the camera frame</li>
                <li>• Gestures are smoothed for natural movement</li>
                <li>• You can still use mouse/trackpad while gestures are active</li>
                <li>• Press H to toggle gesture control on/off</li>
              </ul>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
