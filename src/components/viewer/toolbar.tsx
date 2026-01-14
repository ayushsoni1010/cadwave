'use client';

import * as React from 'react';
import {
  FolderOpen,
  Eye,
  EyeOff,
  Maximize2,
  RotateCcw,
  Grid3X3,
  Axis3D,
  Move3D,
  Hand,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Settings,
  Download,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  onOpenFile: () => void;
  onResetView: () => void;
  onFitToView: () => void;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleGestures: () => void;
  onExplodeChange: (factor: number) => void;
  onShowInfo: () => void;
  onShowGestureGuide?: () => void;
  
  showGrid: boolean;
  showAxes: boolean;
  gesturesEnabled: boolean;
  gesturesAvailable: boolean;
  explodeFactor: number;
  hasModel: boolean;
  isLoading: boolean;
}

export function Toolbar({
  onOpenFile,
  onResetView,
  onFitToView,
  onToggleGrid,
  onToggleAxes,
  onToggleGestures,
  onExplodeChange,
  onShowInfo,
  onShowGestureGuide,
  showGrid,
  showAxes,
  gesturesEnabled,
  gesturesAvailable,
  explodeFactor,
  hasModel,
  isLoading,
}: ToolbarProps) {
  return (
    <div className="flex h-12 items-center gap-1 border-b border-zinc-800/50 bg-zinc-950/80 px-3 backdrop-blur-sm">
      {/* File Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white">
            <span className="font-medium">File</span>
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 bg-zinc-900 border-zinc-800">
          <DropdownMenuItem onClick={onOpenFile} className="gap-2 text-zinc-200 focus:bg-zinc-800 focus:text-white">
            <FolderOpen className="size-4" />
            Open File...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem disabled className="gap-2 text-zinc-400">
            <Download className="size-4" />
            Export...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white">
            <span className="font-medium">View</span>
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 bg-zinc-900 border-zinc-800">
          <DropdownMenuItem onClick={onResetView} disabled={!hasModel} className="gap-2 text-zinc-200 focus:bg-zinc-800 focus:text-white">
            <RotateCcw className="size-4" />
            Reset View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onFitToView} disabled={!hasModel} className="gap-2 text-zinc-200 focus:bg-zinc-800 focus:text-white">
            <Maximize2 className="size-4" />
            Fit to View
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuCheckboxItem
            checked={showGrid}
            onCheckedChange={onToggleGrid}
            className="gap-2 text-zinc-200 focus:bg-zinc-800 focus:text-white"
          >
            <Grid3X3 className="size-4" />
            Show Grid
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showAxes}
            onCheckedChange={onToggleAxes}
            className="gap-2 text-zinc-200 focus:bg-zinc-800 focus:text-white"
          >
            <Axis3D className="size-4" />
            Show Axes
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Explode Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={!hasModel}
            className="h-8 gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40"
          >
            <Move3D className="size-4" />
            <span className="font-medium">Explode</span>
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 bg-zinc-900 border-zinc-800">
          <DropdownMenuLabel className="text-xs text-zinc-500">Explode Factor</DropdownMenuLabel>
          <div className="px-2 py-2">
            <input
              type="range"
              min="0"
              max="100"
              value={explodeFactor * 100}
              onChange={(e) => onExplodeChange(parseInt(e.target.value) / 100)}
              className="w-full accent-amber-500"
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-500">
              <span>Assembled</span>
              <span>{Math.round(explodeFactor * 100)}%</span>
              <span>Exploded</span>
            </div>
          </div>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem onClick={() => onExplodeChange(0)} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
            Reset (0%)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExplodeChange(0.5)} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
            Half (50%)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExplodeChange(1)} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
            Full (100%)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-6 bg-zinc-800" />

      {/* Quick Actions */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon-sm"
              onClick={onOpenFile}
              disabled={isLoading}
              className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <FolderOpen className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open File</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon-sm"
              onClick={onResetView}
              disabled={!hasModel}
              className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <RotateCcw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset View (R)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon-sm"
              onClick={onFitToView}
              disabled={!hasModel}
              className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <Maximize2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Fit to View (F)</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 bg-zinc-800" />

      {/* Gesture Toggle */}
      {gesturesAvailable && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={gesturesEnabled ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={onToggleGestures}
                className={cn(
                  gesturesEnabled 
                    ? 'bg-amber-600 text-white hover:bg-amber-500' 
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                )}
              >
                <Hand className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {gesturesEnabled ? 'Disable Gestures' : 'Enable Gestures (H)'}
            </TooltipContent>
          </Tooltip>
          {onShowGestureGuide && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onShowGestureGuide}
                  className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <Info className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Gesture Guide</TooltipContent>
            </Tooltip>
          )}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Info Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon-sm"
            onClick={onShowInfo}
            disabled={!hasModel}
            className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <Info className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Model Info</TooltipContent>
      </Tooltip>
    </div>
  );
}
