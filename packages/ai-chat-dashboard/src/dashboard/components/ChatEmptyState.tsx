import React, { useState } from 'react';
import { BarChart3, Boxes, Globe, PackageSearch, ShoppingCart, Sparkles, TrendingUp, Users } from 'lucide-react';
import { T } from './theme';

const SUGGESTIONS = [
    { icon: TrendingUp, title: 'Sales outlook', prompt: 'How did sales go in the last 30 days, and what will the next 30 days look like?' },
    { icon: Boxes, title: 'Reorder planning', prompt: 'Which products should I reorder, and how many?' },
    { icon: PackageSearch, title: 'Find products', prompt: 'Which of our products are electronics, and how much stock do we have?' },
    { icon: ShoppingCart, title: 'Recent orders', prompt: 'Show me the latest orders and anything that needs attention.' },
    { icon: Users, title: 'Customers', prompt: 'Where are my customers, and what are my best sellers?' },
    { icon: Globe, title: 'Competitor prices', prompt: 'Research competitor prices for my top products and compare them with mine.' },
];

interface ChatEmptyStateProps {
    onSend: (text: string) => void;
}

export function ChatEmptyState({ onSend }: ChatEmptyStateProps) {
    return (
        <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
            <div style={{ width: '100%', maxWidth: 760 }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 14, margin: '0 auto 14px',
                        background: T.primary, color: T.primaryFg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Sparkles size={24} />
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 600, color: T.fg, margin: '0 0 8px' }}>How can I help with your store?</h1>
                    <p style={{ fontSize: 14, color: T.mutedFg, lineHeight: 1.6, margin: 0 }}>
                        Ask about products, orders, customers, sales and stock — or ask me to make changes.
                        Anything destructive waits for your confirmation.
                    </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                    {SUGGESTIONS.map(s => (
                        <Suggestion key={s.title} {...s} onClick={() => onSend(s.prompt)} />
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18, fontSize: 12, color: T.mutedFg }}>
                    <BarChart3 size={13} />
                    Sales, forecast and inventory answers come with charts and tables.
                </div>
            </div>
        </div>
    );
}

function Suggestion({ icon: Icon, title, prompt, onClick }: { icon: typeof Sparkles; title: string; prompt: string; onClick: () => void }) {
    const [hover, setHover] = useState(false);
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, textAlign: 'left',
                padding: 14, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${hover ? T.primary : T.border}`, background: hover ? T.accent : T.bg,
                transition: 'border-color 0.15s, background 0.15s',
            }}
        >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: T.fg }}>
                <Icon size={16} style={{ color: T.primary }} />
                {title}
            </span>
            <span style={{ fontSize: 12.5, color: T.mutedFg, lineHeight: 1.45 }}>{prompt}</span>
        </button>
    );
}
