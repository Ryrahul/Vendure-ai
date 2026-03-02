import React from 'react';
import { Package } from 'lucide-react';
import type { ChatOrder } from '../types';
import { cn } from '../utils/cn';

interface OrderCardProps {
    order: ChatOrder;
    onNavigate?: (path: string) => void;
    formatPrice: (price: number) => string;
    className?: string;
}

/** Map order states to user-friendly labels */
function getStateLabel(state: string): string {
    const map: Record<string, string> = {
        ArrangingPayment: 'Awaiting Payment',
        PaymentAuthorized: 'Payment Authorized',
        PaymentSettled: 'Payment Settled',
        PartiallyShipped: 'Partially Shipped',
        Shipped: 'Shipped',
        PartiallyDelivered: 'Partially Delivered',
        Delivered: 'Delivered',
        Cancelled: 'Cancelled',
    };
    return map[state] ?? state;
}

/** Get a color class based on order state */
function getStateBadgeClass(state: string): string {
    if (state === 'Delivered') return 'bg-green-100 text-green-800';
    if (state === 'Shipped' || state === 'PartiallyShipped') return 'bg-blue-100 text-blue-800';
    if (state === 'Cancelled') return 'bg-red-100 text-red-800';
    return 'bg-muted text-muted-foreground';
}

export function OrderCard({ order, onNavigate, formatPrice, className }: OrderCardProps) {
    const placedDate = order.orderPlacedAt
        ? new Date(order.orderPlacedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : null;

    return (
        <div className={cn('rounded-md border bg-background p-3 space-y-2', className)}>
            {/* Header: order code + state */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Package className="h-3 w-3" />
                    <span>Order {order.code}</span>
                </div>
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', getStateBadgeClass(order.state))}>
                    {getStateLabel(order.state)}
                </span>
            </div>

            {/* Meta row: date + total */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                {placedDate && <span>{placedDate}</span>}
                <span className="font-semibold text-foreground">{formatPrice(order.total)}</span>
            </div>

            {/* Order lines with product images */}
            <div className="space-y-1.5">
                {order.lines.map((line, idx) => {
                    const handleClick = (e: React.MouseEvent) => {
                        if (onNavigate && line.slug) {
                            e.preventDefault();
                            onNavigate(`/product/${line.slug}`);
                        }
                    };

                    return (
                        <div key={idx} className="flex items-center gap-2">
                            {/* Product thumbnail */}
                            <a
                                href={line.slug ? `/product/${line.slug}` : '#'}
                                onClick={handleClick}
                                className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted"
                            >
                                {line.image ? (
                                    <img
                                        src={line.image}
                                        alt={line.productName}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <span className="text-muted-foreground text-[9px] flex items-center justify-center h-full">
                                        No img
                                    </span>
                                )}
                            </a>
                            {/* Product details */}
                            <div className="min-w-0 flex-1">
                                <a
                                    href={line.slug ? `/product/${line.slug}` : '#'}
                                    onClick={handleClick}
                                    className="block"
                                >
                                    <p className="text-sm line-clamp-1 hover:underline">
                                        {line.productName}
                                    </p>
                                </a>
                                <p className="text-xs text-muted-foreground">
                                    Qty: {line.quantity} &middot; {formatPrice(line.linePriceWithTax)}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Fulfillment info */}
            {order.fulfillments.length > 0 && (
                <div className="border-t pt-1.5 space-y-0.5">
                    {order.fulfillments.map((f, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground">
                            {f.method}: <span className="font-medium">{f.state}</span>
                            {f.trackingCode && (
                                <span className="ml-1">
                                    (Tracking: <span className="font-mono">{f.trackingCode}</span>)
                                </span>
                            )}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}
