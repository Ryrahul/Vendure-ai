import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Sparkles, SquarePen, X } from 'lucide-react';
import { useAdminChat } from '../hooks/use-admin-chat';
import { AssistantAvatar, ChatMessageBubble } from './ChatMessageBubble';
import { ChatInput } from './ChatInput';
import { LoadingStatus } from './LoadingStatus';
import { CHAT_CSS, T } from './theme';

const QUICK_PROMPTS = ['How are sales this month?', 'What should I reorder?', 'Show recent orders'];

function HeaderButton({ title, onClick, href, children }: { title: string; onClick?: () => void; href?: string; children: React.ReactNode }) {
    const [hover, setHover] = useState(false);
    const style: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? T.accent : 'transparent', color: T.mutedFg,
    };
    const events = { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) };
    return href ? (
        <a href={href} title={title} aria-label={title} style={style} {...events}>{children}</a>
    ) : (
        <button type="button" title={title} aria-label={title} onClick={onClick} style={style} {...events}>{children}</button>
    );
}

/**
 * Floating quick chat available on every dashboard page (the ✨ button). Shares the chat
 * logic with the AI Chat page, so confirmations and insight cards work here too.
 */
export function AiChatToolbarButton() {
    const [open, setOpen] = useState(false);
    const { messages, input, setInput, isLoading, scrollRef, sendMessage, newConversation, resolveConfirmation } = useAdminChat();
    const panelRef = useRef<HTMLDivElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);

    // Close on click outside.
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            const target = e.target as Node;
            if (panelRef.current?.contains(target) || fabRef.current?.contains(target)) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <>
            <button
                ref={fabRef}
                type="button"
                className="ai-chat-fab"
                onClick={() => setOpen(prev => !prev)}
                title="AI Assistant"
                aria-label="AI Assistant"
                style={{
                    position: 'fixed', zIndex: 9998, bottom: 20, right: 20,
                    width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: T.primary, color: T.primaryFg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.18)', transition: 'transform 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
                {open ? <X size={20} /> : <Sparkles size={20} />}
            </button>

            {open && (
                <div
                    ref={panelRef}
                    style={{
                        position: 'fixed', zIndex: 9999, bottom: 80, right: 20,
                        width: 'min(440px, calc(100vw - 40px))', height: 'min(620px, calc(100vh - 110px))',
                        display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden',
                        border: `1px solid ${T.border}`, background: T.bg, boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 10px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                        <Sparkles size={16} style={{ color: T.primary }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.fg, flex: 1 }}>AI Assistant</span>
                        {messages.length > 0 && (
                            <HeaderButton title="New conversation" onClick={newConversation}>
                                <SquarePen size={15} />
                            </HeaderButton>
                        )}
                        <HeaderButton title="Open full view" href="/dashboard/extensions/ai-chat">
                            <Maximize2 size={15} />
                        </HeaderButton>
                        <HeaderButton title="Close" onClick={() => setOpen(false)}>
                            <X size={15} />
                        </HeaderButton>
                    </div>

                    <div className="ac-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 14px', minHeight: 0 }}>
                        {messages.length === 0 ? (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10, padding: '0 12px' }}>
                                <AssistantAvatar size={40} />
                                <div style={{ fontSize: 15, fontWeight: 600, color: T.fg }}>Ask anything about your store</div>
                                <div style={{ fontSize: 13, color: T.mutedFg }}>Products, orders, customers, sales and stock</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
                                    {QUICK_PROMPTS.map(q => (
                                        <button
                                            key={q}
                                            type="button"
                                            onClick={() => sendMessage(q)}
                                            style={{
                                                padding: '6px 12px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                                                border: `1px solid ${T.border}`, background: T.bg, color: T.fg,
                                            }}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <>
                                {messages.map(msg => (
                                    <ChatMessageBubble
                                        key={msg.id}
                                        message={msg}
                                        compact
                                        onResolveConfirmation={(id, decision) => resolveConfirmation(msg.id, id, decision)}
                                    />
                                ))}
                                {isLoading && (
                                    <div className="ac-msg" style={{ display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>
                                        <AssistantAvatar size={24} />
                                        <span className="ac-dot" />
                                        <span className="ac-dot" style={{ animationDelay: '0.15s' }} />
                                        <span className="ac-dot" style={{ animationDelay: '0.3s' }} />
                                        <LoadingStatus fontSize={11} />
                                    </div>
                                )}
                                <div ref={scrollRef} style={{ height: 4 }} />
                            </>
                        )}
                    </div>

                    <div style={{ padding: '8px 12px 12px', flexShrink: 0 }}>
                        <ChatInput value={input} onChange={setInput} onSubmit={() => sendMessage(input)} disabled={isLoading} compact />
                    </div>
                </div>
            )}

            <style>{CHAT_CSS}</style>
            {/* On the AI Chat page itself the floating button would be a duplicate. */}
            <style>{`body:has(.ai-chat-page) .ai-chat-fab { display: none !important; }`}</style>
        </>
    );
}
