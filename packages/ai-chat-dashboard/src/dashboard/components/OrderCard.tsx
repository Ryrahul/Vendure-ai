import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Order } from '../types';

interface OrderCardProps {
    order: Order;
}

function getStateColor(state: string): string {
    switch (state) {
        case 'PaymentSettled':
        case 'Delivered':
            return '#10b981';
        case 'Cancelled':
            return '#ef4444';
        case 'Shipped':
        case 'PartiallyShipped':
            return '#3b82f6';
        default:
            return '#94a3b8';
    }
}

export function OrderCard({ order }: OrderCardProps) {
    const total = `$${(order.total / 100).toFixed(2)}`;
    const date = order.orderPlacedAt
        ? new Date(order.orderPlacedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
    const [hovered, setHovered] = useState(false);

    return (
        <div
            style={{
                display: 'flex', alignItems: 'center', gap: 16,
                borderRadius: 8, padding: '12px 16px', cursor: 'pointer',
                border: '1px solid var(--border, #e2e8f0)',
                background: hovered ? 'var(--muted, #f8fafc)' : 'var(--background, #fff)',
                transition: 'background 0.15s',
            }}
            onClick={() => window.open(`/dashboard/orders/${order.id}`, '_self')}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Status dot */}
            <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: getStateColor(order.state) }} />

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 500, color: 'var(--foreground, #0f172a)' }}>{order.code}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground, #64748b)' }}>{order.state}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2, fontSize: 12, color: 'var(--muted-foreground, #64748b)' }}>
                    {date && <span>{date}</span>}
                    <span>{order.lines.length} item{order.lines.length !== 1 ? 's' : ''}</span>
                </div>
            </div>

            {/* Total + arrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>{total}</span>
                <ArrowUpRight style={{ width: 14, height: 14, color: 'var(--muted-foreground, #94a3b8)', opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }} />
            </div>
        </div>
    );
}
