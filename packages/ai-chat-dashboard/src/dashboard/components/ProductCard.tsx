import React, { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { Product } from '../types';

interface ProductCardProps {
    product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
    const price = `$${(product.price / 100).toFixed(2)}`;
    const [hovered, setHovered] = useState(false);

    return (
        <div
            style={{
                flexShrink: 0, width: 128, cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
                border: `1px solid ${hovered ? 'var(--foreground, #334155)' : 'var(--border, #e2e8f0)'}`,
                background: 'var(--background, #fff)',
                transition: 'border-color 0.15s',
            }}
            onClick={() => window.open(`/dashboard/products/${product.id}`, '_blank')}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={{ height: 80, width: '100%', overflow: 'hidden', background: 'var(--muted, #f1f5f9)' }}>
                {product.image ? (
                    <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.25 }}>
                        <ImageIcon style={{ width: 20, height: 20, color: 'var(--muted-foreground, #94a3b8)' }} />
                    </div>
                )}
            </div>
            <div style={{ padding: '8px 10px' }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--foreground, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{product.name}</p>
                <p style={{ fontSize: 11, color: 'var(--muted-foreground, #64748b)', margin: '2px 0 0' }}>{price}</p>
            </div>
        </div>
    );
}
