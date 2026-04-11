import React, { useState } from 'react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import type { SessionSummary } from '../hooks/use-session-list';

function formatDate(d: string | null): string {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface SessionSidebarProps {
    sessions: SessionSummary[];
    activeSessionId: string;
    onSelect: (sessionId: string) => void;
    onNew: () => void;
    onDelete: (sessionId: string) => void;
}

export function SessionSidebar({ sessions, activeSessionId, onSelect, onNew, onDelete }: SessionSidebarProps) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            borderRight: '1px solid var(--border, #e2e8f0)',
            background: 'var(--muted, #f8fafc)',
            width: 240, minWidth: 200, flexShrink: 0,
        }}>
            {/* New chat button */}
            <div style={{ padding: 12, borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                <button
                    onClick={onNew}
                    style={{
                        display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center',
                        gap: 8, padding: '8px 12px', borderRadius: 6,
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'var(--background, #fff)',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        color: 'var(--foreground, #0f172a)',
                    }}
                >
                    <Plus style={{ width: 16, height: 16 }} />
                    New Chat
                </button>
            </div>

            {/* Session list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {sessions.length === 0 && (
                    <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground, #64748b)', padding: '24px 0' }}>
                        No previous chats
                    </div>
                )}
                {sessions.map(s => {
                    const isActive = s.sessionId === activeSessionId;
                    return <SessionItem key={s.sessionId} session={s} isActive={isActive} onSelect={onSelect} onDelete={onDelete} />;
                })}
            </div>
        </div>
    );
}

function SessionItem({ session, isActive, onSelect, onDelete }: {
    session: SessionSummary;
    isActive: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                marginBottom: 2,
                background: isActive ? 'var(--muted, #e2e8f0)' : hovered ? 'rgba(0,0,0,0.03)' : 'transparent',
                color: isActive ? 'var(--foreground, #0f172a)' : 'var(--muted-foreground, #64748b)',
                transition: 'background 0.1s',
            }}
            onClick={() => onSelect(session.sessionId)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <MessageSquare style={{ width: 14, height: 14, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 12, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {session.title || 'Untitled'}
                </div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>
                    {formatDate(session.lastMessageAt || session.createdAt)}
                </div>
            </div>
            {hovered && (
                <button
                    onClick={e => { e.stopPropagation(); onDelete(session.sessionId); }}
                    style={{
                        padding: 4, borderRadius: 4, border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Delete"
                >
                    <Trash2 style={{ width: 12, height: 12, color: '#ef4444' }} />
                </button>
            )}
        </div>
    );
}
