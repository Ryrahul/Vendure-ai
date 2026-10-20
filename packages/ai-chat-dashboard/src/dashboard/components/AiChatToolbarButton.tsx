import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthHeaders } from '../hooks/use-auth-headers';
import { SparklesIcon, XIcon, Maximize2Icon, ArrowUp, Bot } from 'lucide-react';
import type { ChatMessage } from '../types';
import { ChatMessageBubble } from './ChatMessageBubble';
import { LoadingStatus } from './LoadingStatus';

function generateSessionId(): string {
    return `toolbar-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function MiniLoadingDots() {
    return (
        <div style={{
            display: 'flex', gap: 10, padding: 12, margin: '8px 0',
            borderRadius: 10, border: '1px solid var(--border, #e2e8f0)',
            background: 'var(--background, #fff)',
        }}>
            <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: 'var(--foreground, #0f172a)', color: 'var(--background, #fff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Bot style={{ width: 12, height: 12 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, paddingTop: 4 }}>
                <span className="ac-dot" />
                <span className="ac-dot" style={{ animationDelay: '0.15s' }} />
                <span className="ac-dot" style={{ animationDelay: '0.3s' }} />
                <LoadingStatus fontSize={11} />
            </div>
        </div>
    );
}

export function AiChatToolbarButton() {
    const getHeaders = useAuthHeaders();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>(generateSessionId);
    const scrollRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                fabRef.current && !fabRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const sendMessage = useCallback(
        async (text: string) => {
            if (!text.trim() || isLoading) return;
            const trimmed = text.trim();
            setMessages(prev => [
                ...prev,
                { id: `u-${Date.now()}`, role: 'user', content: trimmed },
            ]);
            setInput('');
            setIsLoading(true);

            try {
                const headers = getHeaders(true);

                const res = await fetch('/admin-ai-chat/chat', {
                    method: 'POST',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify({
                        message: trimmed,
                        sessionId,
                        history: messages.map(m => ({ role: m.role, content: m.content })),
                        currentPage: window.location.pathname,
                    }),
                });
                const data = await res.json();
                if (data.sessionId && data.sessionId !== sessionId) {
                    setSessionId(data.sessionId);
                }
                setMessages(prev => [
                    ...prev,
                    {
                        id: `a-${Date.now()}`,
                        role: 'assistant',
                        content: data.message ?? 'No response',
                        products: data.products,
                        collections: data.collections,
                        orders: data.orders,
                    },
                ]);
                if (data.navigateTo) {
                    setTimeout(() => {
                        const path = data.navigateTo.startsWith('/') ? `/dashboard${data.navigateTo}` : `/dashboard/${data.navigateTo}`;
                        window.location.href = path;
                    }, 1200);
                }
            } catch (err) {
                setMessages(prev => [
                    ...prev,
                    {
                        id: `e-${Date.now()}`,
                        role: 'assistant',
                        content: `Error: ${err instanceof Error ? err.message : 'Request failed'}`,
                    },
                ]);
            } finally {
                setIsLoading(false);
            }
        },
        [isLoading, messages, sessionId, getHeaders],
    );

    const canSend = input.trim() && !isLoading;

    return (
        <>
            {/* Hidden toolbar slot */}
            <span style={{ display: 'none' }} />

            {/* FAB button */}
            <button
                ref={fabRef}
                onClick={() => setOpen(prev => !prev)}
                style={{
                    position: 'fixed', zIndex: 9998, bottom: 20, right: 20,
                    width: 48, height: 48, borderRadius: '50%', border: 'none',
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(79,70,229,0.4)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.4)'; }}
                title="AI Assistant"
            >
                {open
                    ? <XIcon style={{ width: 20, height: 20 }} />
                    : <SparklesIcon style={{ width: 20, height: 20 }} />
                }
            </button>

            {/* Floating chat panel */}
            {open && (
                <div
                    ref={panelRef}
                    style={{
                        position: 'fixed', zIndex: 9999,
                        bottom: 80, right: 20,
                        width: 400, height: 'min(560px, calc(100vh - 110px))',
                        display: 'flex', flexDirection: 'column',
                        borderRadius: 12, overflow: 'hidden',
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'var(--background, #fff)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.16)',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: '1px solid var(--border, #e2e8f0)',
                        padding: '10px 16px', flexShrink: 0,
                        background: 'var(--background, #fff)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <SparklesIcon style={{ width: 16, height: 16, color: '#7c3aed' }} />
                            <span style={{ fontSize: 14, fontWeight: 600 }}>AI Assistant</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <a
                                href="/dashboard/extensions/ai-chat"
                                style={{
                                    width: 24, height: 24, borderRadius: 6, border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--muted-foreground, #64748b)', textDecoration: 'none',
                                }}
                                title="Open full view"
                            >
                                <Maximize2Icon style={{ width: 14, height: 14 }} />
                            </a>
                            <button
                                onClick={() => setOpen(false)}
                                style={{
                                    width: 24, height: 24, borderRadius: 6, border: 'none',
                                    background: 'transparent', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--muted-foreground, #64748b)',
                                }}
                            >
                                <XIcon style={{ width: 14, height: 14 }} />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', minHeight: 0 }}>
                        {messages.length === 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ textAlign: 'center', padding: '0 16px' }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        background: 'rgba(124,58,237,0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto 8px',
                                    }}>
                                        <SparklesIcon style={{ width: 20, height: 20, color: '#7c3aed' }} />
                                    </div>
                                    <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 4px' }}>Ask anything about your store</p>
                                    <p style={{ fontSize: 12, color: 'var(--muted-foreground, #64748b)', margin: '0 0 12px' }}>
                                        Products, orders, customers...
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                                        {['Recent orders', 'Find a product', 'Store overview'].map(q => (
                                            <button
                                                key={q}
                                                onClick={() => sendMessage(q)}
                                                style={{
                                                    padding: '4px 12px', borderRadius: 99, fontSize: 12,
                                                    border: '1px solid var(--border, #e2e8f0)',
                                                    background: 'transparent', cursor: 'pointer',
                                                    color: 'var(--muted-foreground, #64748b)',
                                                }}
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {messages.map(msg => (
                                    <ChatMessageBubble key={msg.id} message={msg} />
                                ))}
                                {isLoading && <MiniLoadingDots />}
                                <div ref={scrollRef} style={{ height: 4 }} />
                            </>
                        )}
                    </div>

                    {/* Input */}
                    <div style={{
                        borderTop: '1px solid var(--border, #e2e8f0)',
                        padding: '10px 12px', flexShrink: 0,
                        background: 'var(--background, #fff)',
                    }}>
                        <form
                            style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}
                            onSubmit={e => { e.preventDefault(); sendMessage(input); }}
                        >
                            <textarea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (canSend) sendMessage(input);
                                    }
                                }}
                                placeholder="Ask something..."
                                disabled={isLoading}
                                rows={1}
                                style={{
                                    flex: 1, resize: 'none', borderRadius: 8,
                                    border: '1px solid var(--border, #e2e8f0)',
                                    background: 'var(--background, #fff)',
                                    padding: '8px 12px', fontSize: 13, outline: 'none',
                                    color: 'var(--foreground, #0f172a)',
                                    maxHeight: 80, minHeight: 36, fontFamily: 'inherit',
                                    opacity: isLoading ? 0.5 : 1,
                                }}
                            />
                            <button
                                type="submit"
                                disabled={!canSend}
                                style={{
                                    width: 36, height: 36, borderRadius: 8, border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, cursor: canSend ? 'pointer' : 'default',
                                    background: canSend ? 'var(--primary, #6366f1)' : 'var(--muted, #f1f5f9)',
                                    color: canSend ? '#fff' : 'var(--muted-foreground, #94a3b8)',
                                    transition: 'background 0.15s',
                                }}
                            >
                                <ArrowUp style={{ width: 16, height: 16 }} />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
