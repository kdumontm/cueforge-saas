'use client';

import { useState } from 'react';
import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface DragDropListProps<T extends { id: number | string }> {
  items: T[];
  onReorder: (newItems: T[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export default function DragDropList<T extends { id: number | string }>({
  items,
  onReorder,
  renderItem,
}: DragDropListProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);
  const [list, setList] = useState<T[]>(items);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndicator(index);
  };

  const handleDragLeave = () => {
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDropIndicator(null);
      return;
    }

    const newList = Array.from(list);
    const draggedItem = newList[draggedIndex];
    newList.splice(draggedIndex, 1);
    newList.splice(index, 0, draggedItem);

    setList(newList);
    onReorder(newList);
    setDraggedIndex(null);
    setDropIndicator(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropIndicator(null);
  };

  const handleMoveItem = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= list.length) return;

    const newList = Array.from(list);
    const item = newList[fromIndex];
    newList.splice(fromIndex, 1);
    newList.splice(toIndex, 0, item);

    setList(newList);
    onReorder(newList);
  };

  return (
    <div className="space-y-0">
      {list.map((item, index) => (
        <div key={item.id}>
          {/* Drop indicator line above */}
          {dropIndicator === index && (
            <div className="h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 mx-2" />
          )}

          {/* Draggable item with keyboard controls */}
          <div className="flex items-center gap-1">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => handleMoveItem(index, 'up')}
                disabled={index === 0}
                className="p-0.5 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label={`Déplacer ${item} vers le haut`}
                title="Déplacer vers le haut"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => handleMoveItem(index, 'down')}
                disabled={index === list.length - 1}
                className="p-0.5 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label={`Déplacer ${item} vers le bas`}
                title="Déplacer vers le bas"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              aria-grabbed={draggedIndex === index}
              aria-dropeffect="move"
              className={`flex-1 transition-all duration-150 cursor-move ${
                draggedIndex === index ? 'opacity-50' : 'opacity-100'
              }`}
            >
              {renderItem(item, index)}
            </div>
          </div>
        </div>
      ))}

      {/* Drop indicator line at the end */}
      {dropIndicator === list.length && (
        <div className="h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 mx-2" />
      )}
    </div>
  );
}
