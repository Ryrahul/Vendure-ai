import React, { useCallback } from 'react';
import { useAdminChat } from './hooks/use-admin-chat';
import { useSessionList } from './hooks/use-session-list';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatEmptyState } from './components/ChatEmptyState';
import { ChatMessageBubble } from './components/ChatMessageBubble';
import { ChatInput } from './components/ChatInput';
import { Bot } from 'lucide-react';

function LoadingDots() {
    return (
        <div style={{
            display: 'flex', gap: 12, padding: 16, margin: '16px 0',
            borderRadius: 12, border: '1px solid var(--border, #e2e8f0)',
            background: 'var(--background, #fff)',
        }}>
            <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--foreground, #0f172a)', color: 'var(--background, #fff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Bot style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 6 }}>
                <span className="ac-dot" />
                <span className="ac-dot" style={{ animationDelay: '0.15s' }} />
                <span className="ac-dot" style={{ animationDelay: '0.3s' }} />
            </div>
        </div>
    );
}

export function AdminChatWidget() {
    const {
        messages, input, setInput, isLoading, scrollRef,
        sendMessage, sessionId, newConversation, loadSession, resolveConfirmation,
    } = useAdminChat();

    const { sessions, refresh: refreshSessions, deleteSession } = useSessionList();

    const handleNewChat = useCallback(() => {
        newConversation();
    }, [newConversation]);

    const handleSelectSession = useCallback(async (sid: string) => {
        await loadSession(sid);
    }, [loadSession]);

    const handleDeleteSession = useCallback(async (sid: string) => {
        await deleteSession(sid);
        if (sid === sessionId) {
            newConversation();
        }
    }, [deleteSession, sessionId, newConversation]);

    const handleSend = useCallback(async (text: string) => {
        await sendMessage(text);
        setTimeout(() => refreshSessions(), 500);
    }, [sendMessage, refreshSessions]);

    return (
        <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--background, #fff)' }}>
            {/* Sidebar */}
            <SessionSidebar
                sessions={sessions}
                activeSessionId={sessionId}
                onSelect={handleSelectSession}
                onNew={handleNewChat}
                onDelete={handleDeleteSession}
            />

            {/* Main chat area */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
                {/* Header */}
                <div style={{
                    borderBottom: '1px solid var(--border, #e2e8f0)',
                    padding: '10px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--background, #fff)',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground, #0f172a)' }}>AI Assistant</span>
                    {messages.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground, #94a3b8)', fontFamily: 'monospace' }}>
                            {sessionId.slice(0, 20)}...
                        </span>
                    )}
                </div>

                {/* Messages Area */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {messages.length === 0 ? (
                        <ChatEmptyState onSend={handleSend} />
                    ) : (
                        <div style={{ maxWidth: 768, margin: '0 auto', padding: '0 20px' }}>
                            <div style={{ padding: '16px 0' }}>
                                {messages.map(msg => (
                                    <ChatMessageBubble
                                        key={msg.id}
                                        message={msg}
                                        onResolveConfirmation={(id, decision) => resolveConfirmation(msg.id, id, decision)}
                                    />
                                ))}
                                {isLoading && <LoadingDots />}
                                <div ref={scrollRef} style={{ height: 32 }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Input */}
                <div style={{
                    borderTop: '1px solid var(--border, #e2e8f0)',
                    background: 'var(--background, #fff)',
                    flexShrink: 0,
                }}>
                    <div style={{ maxWidth: 768, margin: '0 auto' }}>
                        <ChatInput
                            value={input}
                            onChange={setInput}
                            onSubmit={() => handleSend(input)}
                            disabled={isLoading}
                        />
                    </div>
                </div>
            </div>

            <style>{`
                .ac-dot {
                    display: inline-block;
                    width: 5px; height: 5px; border-radius: 50%;
                    background: var(--muted-foreground, #94a3b8);
                    animation: ac-bounce 0.6s infinite alternate;
                }
                @keyframes ac-bounce { to { opacity: 0.3; transform: translateY(-4px); } }
            `}</style>
        </div>
    );
}
