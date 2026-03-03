import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Admin chat widget component for the Vendure dashboard.
 * Sends messages to the /admin-ai-chat/chat REST endpoint
 * and displays AI responses with basic markdown rendering.
 */
export function AdminChatWidget() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    function getHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
        return messages.map(m => ({ role: m.role, content: m.content }));
    }

    async function sendMessage(text: string) {
        if (!text.trim() || isLoading) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text.trim(),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const sessionToken = localStorage.getItem('vendure-session-token');
            const channelToken = localStorage.getItem('vendure-selected-channel-token');

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (sessionToken) {
                headers['Authorization'] = `Bearer ${sessionToken}`;
            }
            if (channelToken) {
                headers['vendure-token'] = channelToken;
            }

            const history = getHistory();

            const res = await fetch('/admin-ai-chat/chat', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    message: text.trim(),
                    history,
                }),
            });

            const data = await res.json();

            const assistantMsg: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: data.message ?? 'No response',
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err) {
            const errorMsg: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: `Error: ${err instanceof Error ? err.message : 'Failed to reach server'}`,
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        sendMessage(input);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Messages area */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                }}
            >
                {messages.length === 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        gap: '16px',
                    }}>
                        <div style={{
                            color: 'var(--color-muted-foreground, #888)',
                            fontSize: '14px',
                            textAlign: 'center',
                        }}>
                            Ask me about your products, orders, customers, or collections.
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {[
                                'Show me recent orders',
                                'Search products',
                                'List collections',
                                'Find customers',
                            ].map(action => (
                                <button
                                    key={action}
                                    onClick={() => sendMessage(action)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '16px',
                                        border: '1px solid var(--color-border, #e2e8f0)',
                                        backgroundColor: 'var(--color-background, #fff)',
                                        color: 'var(--color-foreground, #0f172a)',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {action}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <div
                        key={msg.id}
                        style={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        }}
                    >
                        <div
                            style={{
                                maxWidth: msg.role === 'assistant' ? '90%' : '80%',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                backgroundColor:
                                    msg.role === 'user'
                                        ? 'var(--color-primary, #6366f1)'
                                        : 'var(--color-muted, #f1f5f9)',
                                color:
                                    msg.role === 'user'
                                        ? 'var(--color-primary-foreground, #fff)'
                                        : 'var(--color-foreground, #0f172a)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                            dangerouslySetInnerHTML={
                                msg.role === 'assistant'
                                    ? { __html: simpleMarkdown(msg.content) }
                                    : undefined
                            }
                        >
                            {msg.role === 'user' ? msg.content : undefined}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                backgroundColor: 'var(--color-muted, #f1f5f9)',
                                color: 'var(--color-muted-foreground, #888)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                        >
                            <span style={{
                                display: 'inline-block',
                                width: '16px',
                                height: '16px',
                                border: '2px solid var(--color-muted-foreground, #888)',
                                borderTopColor: 'transparent',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            Thinking...
                        </div>
                    </div>
                )}

                <div ref={scrollRef} />
            </div>

            {/* Input form */}
            <form
                onSubmit={handleSubmit}
                style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '12px 16px',
                    borderTop: '1px solid var(--color-border, #e2e8f0)',
                }}
            >
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Ask about products, orders, customers..."
                    disabled={isLoading}
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border, #e2e8f0)',
                        backgroundColor: 'var(--color-background, #fff)',
                        color: 'var(--color-foreground, #0f172a)',
                        fontSize: '14px',
                        outline: 'none',
                    }}
                />
                <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: 'var(--color-primary, #6366f1)',
                        color: 'var(--color-primary-foreground, #fff)',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                        opacity: isLoading || !input.trim() ? 0.5 : 1,
                    }}
                >
                    Send
                </button>
            </form>

            {/* Spinner animation */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

/**
 * Minimal markdown-to-HTML converter for AI responses.
 * Handles: **bold**, *italic*, `code`, - lists, \n newlines.
 * No external dependencies needed.
 */
function simpleMarkdown(text: string): string {
    let html = text
        // Escape HTML
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`(.+?)`/g, '<code style="background:var(--color-muted,#f1f5f9);padding:1px 4px;border-radius:3px;font-size:13px;">$1</code>')
        // List items (lines starting with - )
        .replace(/^- (.+)$/gm, '<li style="margin-left:16px;list-style:disc;">$1</li>')
        // Newlines
        .replace(/\n/g, '<br/>');

    return html;
}
