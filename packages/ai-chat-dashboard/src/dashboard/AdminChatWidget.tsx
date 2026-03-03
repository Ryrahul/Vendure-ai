import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Simple admin chat widget component.
 * Sends messages to the /admin-ai-chat/chat REST endpoint
 * and displays responses in a chat UI.
 *
 * For now, the backend just replies with a "Hello!" message.
 */
export function AdminChatWidget() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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
            // Use relative URL — dashboard is served from the same origin as the Vendure server
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

            const res = await fetch('/admin-ai-chat/chat', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ message: text.trim() }),
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
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'var(--color-muted-foreground, #888)',
                            fontSize: '14px',
                        }}
                    >
                        Send a message to start chatting with the admin AI assistant.
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
                                maxWidth: '80%',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                backgroundColor:
                                    msg.role === 'user'
                                        ? 'var(--color-primary, #6366f1)'
                                        : 'var(--color-muted, #f1f5f9)',
                                color:
                                    msg.role === 'user'
                                        ? 'var(--color-primary-foreground, #fff)'
                                        : 'var(--color-foreground, #0f172a)',
                            }}
                        >
                            {msg.content}
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
                            }}
                        >
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
                    placeholder="Type a message..."
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
        </div>
    );
}
