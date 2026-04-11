import React from 'react';
import {
    Package, ShoppingCart, Users,
    Layers, Truck, BarChart3, ArrowRight,
} from 'lucide-react';

const SUGGESTIONS = [
    { text: 'Show recent orders', icon: ShoppingCart },
    { text: 'Search for a product', icon: Package },
    { text: 'List all collections', icon: Layers },
    { text: 'Find a customer', icon: Users },
    { text: 'Check shipping methods', icon: Truck },
    { text: 'Show store overview', icon: BarChart3 },
];

interface ChatEmptyStateProps {
    onSend: (text: string) => void;
}

export function ChatEmptyState({ onSend }: ChatEmptyStateProps) {
    return (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ maxWidth: 440, textAlign: 'center' }}>
                <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--foreground, #0f172a)', marginBottom: 12 }}>
                    AI Assistant
                </h1>
                <p style={{ fontSize: 14, color: 'var(--muted-foreground, #64748b)', lineHeight: 1.6, marginBottom: 20 }}>
                    Ask me anything about your store. I can help with products, orders, customers,
                    and more. Here are some ideas to get you started:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {SUGGESTIONS.map(s => {
                        const Icon = s.icon;
                        return (
                            <button
                                key={s.text}
                                onClick={() => onSend(s.text)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: 12, borderRadius: 8, textAlign: 'left', fontSize: 13,
                                    border: '1px solid var(--border, #e2e8f0)',
                                    background: 'var(--background, #fff)',
                                    color: 'var(--foreground, #0f172a)',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted, #f1f5f9)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'var(--background, #fff)')}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Icon style={{ width: 16, height: 16, color: 'var(--muted-foreground, #64748b)' }} />
                                    <span>{s.text}</span>
                                </span>
                                <ArrowRight style={{ width: 16, height: 16, color: 'var(--muted-foreground, #64748b)', opacity: 0.3 }} />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
