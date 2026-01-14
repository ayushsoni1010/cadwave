'use client';

import * as React from 'react';
import { ChevronRight, Eye, EyeOff, Box, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { CADPart, CADAssembly } from '@/lib/viewer/types';

interface PartTreeProps {
  assembly: CADAssembly | null;
  selectedParts: Set<string>;
  hiddenParts: Set<string>;
  onSelectPart: (partId: string, additive: boolean) => void;
  onToggleVisibility: (partId: string) => void;
  onHoverPart: (partId: string | null) => void;
}

interface PartNodeProps {
  part: CADPart;
  children: CADPart[];
  allParts: CADPart[];
  depth: number;
  isSelected: boolean;
  isHidden: boolean;
  onSelect: (partId: string, additive: boolean) => void;
  onToggleVisibility: (partId: string) => void;
  onHover: (partId: string | null) => void;
  selectedParts: Set<string>;
  hiddenParts: Set<string>;
}

function PartNode({
  part,
  children,
  allParts,
  depth,
  isSelected,
  isHidden,
  onSelect,
  onToggleVisibility,
  onHover,
  selectedParts,
  hiddenParts,
}: PartNodeProps) {
  const [isOpen, setIsOpen] = React.useState(true);
  const hasChildren = children.length > 0;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          'group flex h-8 items-center gap-1 rounded-sm px-1 transition-colors',
          isSelected && 'bg-amber-500/20',
          !isSelected && 'hover:bg-zinc-800/50'
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onMouseEnter={() => onHover(part.id)}
        onMouseLeave={() => onHover(null)}
      >
        {/* Expand/Collapse */}
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5 p-0 text-zinc-500 hover:bg-transparent hover:text-white"
            >
              <ChevronRight
                className={cn(
                  'size-3 transition-transform',
                  isOpen && 'rotate-90'
                )}
              />
            </Button>
          </CollapsibleTrigger>
        ) : (
          <div className="size-5" />
        )}

        {/* Icon */}
        {hasChildren ? (
          <Layers className="size-3.5 text-zinc-500" />
        ) : (
          <Box className="size-3.5 text-zinc-500" />
        )}

        {/* Name */}
        <button
          className={cn(
            'flex-1 truncate text-left text-xs',
            isSelected ? 'text-amber-300' : 'text-zinc-300',
            isHidden && 'opacity-50'
          )}
          onClick={(e) => onSelect(part.id, e.ctrlKey || e.metaKey)}
        >
          {part.name}
        </button>

        {/* Visibility Toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            'size-5 p-0 opacity-0 transition-opacity group-hover:opacity-100',
            isHidden ? 'text-zinc-600' : 'text-zinc-400 hover:text-white'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(part.id);
          }}
        >
          {isHidden ? (
            <EyeOff className="size-3" />
          ) : (
            <Eye className="size-3" />
          )}
        </Button>
      </div>

      {hasChildren && (
        <CollapsibleContent>
          {children.map((child) => {
            const grandchildren = allParts.filter(p => p.parentId === child.id);
            return (
              <PartNode
                key={child.id}
                part={child}
                children={grandchildren}
                allParts={allParts}
                depth={depth + 1}
                isSelected={selectedParts.has(child.id)}
                isHidden={hiddenParts.has(child.id)}
                onSelect={onSelect}
                onToggleVisibility={onToggleVisibility}
                onHover={onHover}
                selectedParts={selectedParts}
                hiddenParts={hiddenParts}
              />
            );
          })}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export function PartTree({
  assembly,
  selectedParts,
  hiddenParts,
  onSelectPart,
  onToggleVisibility,
  onHoverPart,
}: PartTreeProps) {
  if (!assembly) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-zinc-500">
          No model loaded.<br />
          Open a CAD file to view parts.
        </p>
      </div>
    );
  }

  const rootParts = assembly.parts.filter(
    p => p.parentId === null || assembly.rootPartIds.includes(p.id)
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {/* Assembly Header */}
        <div className="mb-2 flex items-center gap-2 border-b border-zinc-800 pb-2">
          <Layers className="size-4 text-amber-500" />
          <span className="truncate text-sm font-medium text-white">
            {assembly.name}
          </span>
          <span className="ml-auto text-xs text-zinc-500">
            {assembly.parts.length} parts
          </span>
        </div>

        {/* Part Tree */}
        {rootParts.map((part) => {
          const children = assembly.parts.filter(p => p.parentId === part.id);
          return (
            <PartNode
              key={part.id}
              part={part}
              children={children}
              allParts={assembly.parts}
              depth={0}
              isSelected={selectedParts.has(part.id)}
              isHidden={hiddenParts.has(part.id)}
              onSelect={onSelectPart}
              onToggleVisibility={onToggleVisibility}
              onHover={onHoverPart}
              selectedParts={selectedParts}
              hiddenParts={hiddenParts}
            />
          );
        })}
      </div>
    </ScrollArea>
  );
}
