import React from 'react';
import { ShoppingCart, Loader2 } from 'lucide-react';
import type { ChatProduct } from '../types';
import { cn } from '../utils/cn';

interface ProductCardProps {
    product: ChatProduct;
    onNavigate?: (path: string) => void;
    formatPrice: (price: number) => string;
    addingToCart: boolean;
    onAddToCart: () => void;
    className?: string;
}

export function ProductCard({ product, onNavigate, formatPrice, addingToCart, onAddToCart, className }: ProductCardProps) {
    const handleClick = (e: React.MouseEvent) => {
        if (onNavigate) {
            e.preventDefault();
            onNavigate(`/product/${product.slug}`);
        }
    };

    return (
        <div className={cn('flex gap-2 rounded-md border bg-background p-2', className)}>
            <a
                href={`/product/${product.slug}`}
                onClick={handleClick}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted"
            >
                {product.image ? (
                    <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <span className="text-muted-foreground text-xs flex items-center justify-center h-full">
                        No img
                    </span>
                )}
            </a>
            <div className="min-w-0 flex-1">
                <a
                    href={`/product/${product.slug}`}
                    onClick={handleClick}
                    className="block"
                >
                    <p className="font-medium text-foreground text-sm line-clamp-1 hover:underline">
                        {product.name}
                    </p>
                </a>
                <p className="text-primary font-semibold text-sm">
                    {formatPrice(product.price)}
                </p>
            </div>
            {product.variantId && (
                <button
                    onClick={onAddToCart}
                    disabled={addingToCart}
                    className="self-center shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    aria-label={`Add ${product.name} to cart`}
                >
                    {addingToCart ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <ShoppingCart className="h-3 w-3" />
                    )}
                    <span className="sr-only sm:not-sr-only">Add</span>
                </button>
            )}
        </div>
    );
}
