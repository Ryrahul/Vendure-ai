import React, { useCallback, useState } from 'react';
import { useChannel } from '@vendure/dashboard';
import { PanelLeft, Sparkles, SquarePen } from 'lucide-react';
import { useAdminChat } from './hooks/use-admin-chat';
import { useSessionList } from './hooks/use-session-list';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatEmptyState } from './components/ChatEmptyState';
import { AssistantAvatar, ChatMessageBubble } from './components/ChatMessageBubble';
import { ChatInput } from './components/ChatInput';
import { LoadingStatus } from './components/LoadingStatus';
import { CHAT_CSS, T } from './components/theme';

/** Width of the conversation column; cards and tables use it all. */
const COLUMN = 900;

function Thinking() {
    return (
        <div className="ac-msg" style={{ display: 'flex', gap: 12, padding: '14px 0' }}>
            <AssistantAvatar />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 28 }}>
                <span className="ac-dot" />
                <span className="ac-dot" style={{ animationDelay: '0.15s' }} />
                <span className="ac-dot" style={{ animationDelay: '0.3s' }} />
                <LoadingStatus fontSize={12} />
            </div>
        </div>
    );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
    const [hover, setHover] = useState(false);
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: hover ? T.accent : 'transparent', color: T.mutedFg,
            }}
        >
            {children}
        </button>
    );
}

export function AdminChatWidget() {
    const {
        messages, input, setInput, isLoading, scrollRef,
        sendMessage, sessionId, newConversation, loadSession, resolveConfirmation,
    } = useAdminChat();
    const { sessions, refresh: refreshSessions, deleteSession } = useSessionList();
    const { activeChannel } = useChannel();
    const [showSessions, setShowSessions] = useState(true);

    const handleDeleteSession = useCallback(async (sid: string) => {
        await deleteSession(sid);
        if (sid === sessionId) newConversation();
    }, [deleteSession, sessionId, newConversation]);

    const handleSend = useCallback(async (text: string) => {
        await sendMessage(text);
        setTimeout(() => refreshSessions(), 500);
    }, [sendMessage, refreshSessions]);

    const title = sessions.find(s => s.sessionId === sessionId)?.title;

    return (
        <div className="ai-chat-page" style={{ display: 'flex', height: '100%', minHeight: 0, background: T.bg, borderTop: `1px solid ${T.border}` }}>
            {showSessions && (
                <SessionSidebar
                    sessions={sessions}
                    activeSessionId={sessionId}
                    onSelect={sid => loadSession(sid)}
                    onNew={newConversation}
                    onDelete={handleDeleteSession}
                />
            )}

            <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'column' }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                    borderBottom: `1px solid ${T.border}`, flexShrink: 0,
                }}>
                    <IconButton title={showSessions ? 'Hide conversations' : 'Show conversations'} onClick={() => setShowSessions(v => !v)}>
                        <PanelLeft size={16} />
                    </IconButton>
                    <Sparkles size={16} style={{ color: T.primary, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {messages.length && title ? title : 'AI Assistant'}
                        </div>
                    </div>
                    {activeChannel && (
                        <span
                            title="The assistant works in the channel selected in the dashboard"
                            style={{
                                fontSize: 12, color: T.mutedFg, border: `1px solid ${T.border}`, borderRadius: 999,
                                padding: '3px 10px', whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                            }}
                        >
                            {activeChannel.code === '__default_channel__' ? 'Default channel' : activeChannel.code}
                        </span>
                    )}
                    {messages.length > 0 && (
                        <IconButton title="New conversation" onClick={newConversation}>
                            <SquarePen size={16} />
                        </IconButton>
                    )}
                </div>

                {/* Messages */}
                <div className="ac-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {messages.length === 0 ? (
                        <ChatEmptyState onSend={handleSend} />
                    ) : (
                        <div style={{ maxWidth: COLUMN, margin: '0 auto', padding: '16px 24px 8px' }}>
                            {messages.map(msg => (
                                <ChatMessageBubble
                                    key={msg.id}
                                    message={msg}
                                    onResolveConfirmation={(id, decision) => resolveConfirmation(msg.id, id, decision)}
                                />
                            ))}
                            {isLoading && <Thinking />}
                            <div ref={scrollRef} style={{ height: 24 }} />
                        </div>
                    )}
                </div>

                {/* Input */}
                <div style={{ flexShrink: 0, padding: '8px 24px 16px' }}>
                    <div style={{ maxWidth: COLUMN, margin: '0 auto' }}>
                        <ChatInput value={input} onChange={setInput} onSubmit={() => handleSend(input)} disabled={isLoading} />
                    </div>
                </div>
            </div>

            <style>{CHAT_CSS}</style>
            {/* The dashboard centres every page in a max-width container; the chat uses the full width. */}
            <style>{`.container:has(> * .ai-chat-page), .container:has(.ai-chat-page) { max-width: none !important; padding-left: 0 !important; padding-right: 0 !important; }`}</style>
        </div>
    );
}
