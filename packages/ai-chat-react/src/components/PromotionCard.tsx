import React from 'react';
import { Tag, Ticket, Clock, Zap } from 'lucide-react';
import type { ChatPromotion } from '../types';
import { cn } from '../utils/cn';

interface PromotionCardProps {
    promotion: ChatPromotion;
    className?: string;
}

export function PromotionCard({ promotion, className }: PromotionCardProps) {
    const expiresDate = promotion.endsAt
        ? new Date(promotion.endsAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : null;

    const isCoupon = !!promotion.couponCode;

    return (
        <div className={cn('rounded-md border bg-background p-3 space-y-1.5', className)}>
            {/* Header: promotion name + type badge */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    {isCoupon ? (
                        <Ticket className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                        <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="text-sm font-medium truncate">{promotion.name}</span>
                </div>
                <span
                    className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        isCoupon
                            ? 'bg-primary/10 text-primary'
                            : 'bg-amber-100 text-amber-800',
                    )}
                >
                    {isCoupon ? 'Coupon' : 'Automatic'}
                </span>
            </div>

            {/* Description */}
            {promotion.description && (
                <p className="text-xs text-muted-foreground">{promotion.description}</p>
            )}

            {/* Discount summary */}
            {promotion.discountSummary && (
                <div className="flex items-center gap-1 text-xs font-medium text-green-700">
                    <Tag className="h-3 w-3" />
                    <span>{promotion.discountSummary}</span>
                </div>
            )}

            {/* Coupon code */}
            {promotion.couponCode && (
                <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 text-xs font-mono font-semibold tracking-wider text-foreground">
                        {promotion.couponCode}
                    </code>
                </div>
            )}

            {/* Conditions */}
            {promotion.conditions && promotion.conditions.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                    {promotion.conditions.map((c, idx) => (
                        <span key={idx}>
                            {idx > 0 && ' · '}
                            {c}
                        </span>
                    ))}
                </div>
            )}

            {/* Footer: expiry + usage limit */}
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {expiresDate && (
                    <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        Expires {expiresDate}
                    </span>
                )}
                {promotion.perCustomerUsageLimit && (
                    <span>Limit: {promotion.perCustomerUsageLimit}x per customer</span>
                )}
            </div>
        </div>
    );
}
