import React from 'react';
import { ShoppingCart } from 'lucide-react';
import type { ChatActiveOrder } from '../types';
import { cn } from '../utils/cn';

interface CartSummaryProps {
    order: ChatActiveOrder;
    formatPrice: (price: number) => string;
    className?: string;
}

export function CartSummary({ order, formatPrice, className }: CartSummaryProps) {
    return (
        <div className={cn('mt-3 rounded-md border bg-background p-3 space-y-2', className)}>
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    Your Cart ({order.totalQuantity} item{order.totalQuantity !== 1 ? 's' : ''})
                </span>
                <span className="font-semibold text-foreground">
                    {formatPrice(order.totalWithTax)}
                </span>
            </div>
            <div className="space-y-1.5">
                {order.lines.map((line) => (
                    <div key={line.orderLineId} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                                {line.quantity}x
                            </span>
                            <span className="truncate">{line.productName}</span>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground ml-2">
                            {formatPrice(line.linePriceWithTax)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
