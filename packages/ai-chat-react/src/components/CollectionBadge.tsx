import React from 'react';
import type { ChatCollection } from '../types';
import { cn } from '../utils/cn';

interface CollectionBadgeProps {
    collection: ChatCollection;
    onNavigate?: (path: string) => void;
    className?: string;
}

export function CollectionBadge({ collection, onNavigate, className }: CollectionBadgeProps) {
    const handleClick = (e: React.MouseEvent) => {
        if (onNavigate) {
            e.preventDefault();
            onNavigate(`/collection/${collection.slug}`);
        }
    };

    return (
        <a
            href={`/collection/${collection.slug}`}
            onClick={handleClick}
            className={cn(
                'inline-flex items-center rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground hover:bg-background',
                className,
            )}
        >
            {collection.name}
        </a>
    );
}
