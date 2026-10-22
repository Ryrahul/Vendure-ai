import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles } from 'lucide-react';
import type { ChatMessage } from '../types';
import { ProductCard } from './ProductCard';
import { OrderCard } from './OrderCard';
import { ConfirmationCard } from './ConfirmationCard';
import { hasVisibleInsights, InsightCards } from './InsightCards';
import { T } from './theme';

interface ChatMessageBubbleProps {
    message: ChatMessage;
    onResolveConfirmation?: (confirmationId: string, decision: 'confirm' | 'cancel') => void;
    /** Narrower layout for the toolbar's quick chat. */
    compact?: boolean;
}

export function AssistantAvatar({ size = 28 }: { size?: number }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            background: T.primary, color: T.primaryFg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <Sparkles style={{ width: size * 0.55, height: size * 0.55 }} />
        </div>
    );
}

export function ChatMessageBubble({ message, onResolveConfirmation, compact }: ChatMessageBubbleProps) {
    if (message.role === 'user') {
        return (
            <div className="ac-msg" style={{ display: 'flex', justifyContent: 'flex-end', padding: compact ? '8px 0' : '12px 0' }}>
                <div style={{
                    maxWidth: compact ? '88%' : '75%', padding: '9px 14px', borderRadius: '16px 16px 4px 16px',
                    background: T.primary, color: T.primaryFg, fontSize: 14, lineHeight: 1.55,
                    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                }}>
                    {message.content}
                </div>
            </div>
        );
    }

    const hasConfirmations = !!message.pendingConfirmations?.length;
    const hasInsights = !!message.insights?.length && hasVisibleInsights(message.insights);
    const hasProducts = !!message.products?.length;
    const hasOrders = !!message.orders?.length;

    return (
        <div className="ac-msg" style={{ display: 'flex', gap: compact ? 8 : 12, padding: compact ? '8px 0' : '12px 0' }}>
            <AssistantAvatar size={compact ? 24 : 28} />
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 3 }}>
                {message.content && (
                    <div className="ac-md" style={compact ? { fontSize: 13 } : undefined}>
                        {/* Inline images are hidden: products are shown as cards below. */}
                        <Markdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>
                            {message.content}
                        </Markdown>
                    </div>
                )}

                {hasConfirmations && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {message.pendingConfirmations!.map(c => (
                            <ConfirmationCard
                                key={c.id}
                                confirmation={c}
                                onConfirm={() => onResolveConfirmation?.(c.id, 'confirm')}
                                onCancel={() => onResolveConfirmation?.(c.id, 'cancel')}
                            />
                        ))}
                    </div>
                )}

                {hasInsights && <InsightCards insights={message.insights!} />}

                {hasProducts && (
                    <div className="ac-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                        {message.products!.map(p => (
                            <ProductCard key={p.id} product={p} />
                        ))}
                    </div>
                )}

                {hasOrders && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {message.orders!.map(o => (
                            <OrderCard key={o.id} order={o} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
