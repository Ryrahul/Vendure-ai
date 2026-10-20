import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User } from 'lucide-react';
import type { ChatMessage } from '../types';
import { ProductCard } from './ProductCard';
import { OrderCard } from './OrderCard';
import { ConfirmationCard } from './ConfirmationCard';
import { InsightCards } from './InsightCards';

interface ChatMessageBubbleProps {
    message: ChatMessage;
    onResolveConfirmation?: (confirmationId: string, decision: 'confirm' | 'cancel') => void;
}

export function ChatMessageBubble({ message, onResolveConfirmation }: ChatMessageBubbleProps) {
    const isUser = message.role === 'user';

    if (isUser) {
        return (
            <div style={{ display: 'flex', gap: 12, padding: '16px 0' }}>
                <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--muted, #f1f5f9)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border, #e2e8f0)',
                }}>
                    <User style={{ width: 16, height: 16, color: 'var(--muted-foreground, #64748b)' }} />
                </div>
                <div style={{ flex: 1, paddingTop: 4, fontSize: 13, color: 'var(--foreground, #0f172a)', whiteSpace: 'pre-wrap' }}>
                    {message.content}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            borderRadius: 12, border: '1px solid var(--border, #e2e8f0)',
            background: 'var(--background, #fff)', margin: '16px 0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
            <div style={{ display: 'flex', gap: 12, padding: 16 }}>
                <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--foreground, #0f172a)', color: 'var(--background, #fff)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Bot style={{ width: 16, height: 16 }} />
                </div>
                <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div className="ac-md" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--foreground, #0f172a)' }}>
                        <Markdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                // Hide inline images — products are shown as cards below
                                img: () => null,
                            }}
                        >
                            {message.content}
                        </Markdown>
                    </div>
                </div>
            </div>

            {/* Actions awaiting the administrator's confirmation */}
            {message.pendingConfirmations && message.pendingConfirmations.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {message.pendingConfirmations.map(c => (
                        <ConfirmationCard
                            key={c.id}
                            confirmation={c}
                            onConfirm={() => onResolveConfirmation?.(c.id, 'confirm')}
                            onCancel={() => onResolveConfirmation?.(c.id, 'cancel')}
                        />
                    ))}
                </div>
            )}

            {/* Charts and tables from the business-insight tools */}
            {message.insights && message.insights.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', padding: 12 }}>
                    <InsightCards insights={message.insights} />
                </div>
            )}

            {/* Attached cards */}
            {(message.products?.length || message.orders?.length) ? (
                <div style={{
                    borderTop: '1px solid var(--border, #e2e8f0)',
                    background: 'var(--muted, #f8fafc)', padding: 12,
                    borderRadius: '0 0 12px 12px',
                }}>
                    {message.products && message.products.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                            {message.products.map(p => (
                                <ProductCard key={p.id} product={p} />
                            ))}
                        </div>
                    )}
                    {message.orders && message.orders.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {message.orders.map(o => (
                                <OrderCard key={o.id} order={o} />
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            <style>{`
                .ac-md p { margin: 6px 0; }
                .ac-md p:first-child { margin-top: 0; }
                .ac-md p:last-child { margin-bottom: 0; }
                .ac-md strong { font-weight: 600; }
                .ac-md ul, .ac-md ol { margin: 4px 0 8px; padding-left: 20px; }
                .ac-md li { margin: 2px 0; }
                .ac-md code { background: var(--muted, #f1f5f9); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
                .ac-md pre { background: var(--muted, #f1f5f9); padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
                .ac-md pre code { background: none; padding: 0; }
                .ac-md table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; overflow: hidden; }
                .ac-md thead { background: var(--muted, #f1f5f9); }
                .ac-md th { text-align: left; padding: 8px 12px; font-weight: 600; font-size: 12px; border-bottom: 2px solid var(--border, #e2e8f0); }
                .ac-md td { padding: 8px 12px; border-bottom: 1px solid var(--border, #f1f5f9); }
                .ac-md tbody tr:last-child td { border-bottom: none; }
                .ac-md a { color: var(--primary, #6366f1); text-decoration: underline; }
                .ac-md h1 { font-size: 18px; font-weight: 600; margin: 12px 0 8px; }
                .ac-md h2 { font-size: 16px; font-weight: 600; margin: 10px 0 6px; }
                .ac-md h3 { font-size: 14px; font-weight: 600; margin: 8px 0 4px; }
                .ac-md img { display: none; }
            `}</style>
        </div>
    );
}
