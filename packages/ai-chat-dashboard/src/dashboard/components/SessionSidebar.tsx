import React, { useMemo, useState } from 'react';
import { MessageSquare, Plus, Search, Trash2 } from 'lucide-react';
import type { SessionSummary } from '../hooks/use-session-list';
import { T } from './theme';

const DAY = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "Previous 7 days", "Previous 30 days" or the month. */
function groupLabel(d: string | null): string {
    if (!d) return 'Older';
    const date = new Date(d);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const diff = startOfToday.getTime() - date.getTime();
    if (diff <= 0) return 'Today';
    if (diff <= DAY) return 'Yesterday';
    if (diff <= 7 * DAY) return 'Previous 7 days';
    if (diff <= 30 * DAY) return 'Previous 30 days';
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function timeLabel(d: string | null): string {
    if (!d) return '';
    const date = new Date(d);
    const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
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
    const [query, setQuery] = useState('');

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q ? sessions.filter(s => (s.title || '').toLowerCase().includes(q)) : sessions;
        const map = new Map<string, SessionSummary[]>();
        for (const s of filtered) {
            const label = groupLabel(s.lastMessageAt || s.createdAt);
            map.set(label, [...(map.get(label) ?? []), s]);
        }
        return [...map.entries()];
    }, [sessions, query]);

    return (
        <aside style={{
            display: 'flex', flexDirection: 'column', height: '100%', width: 272, flexShrink: 0,
            borderRight: `1px solid ${T.border}`, background: T.muted,
        }}>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                    type="button"
                    onClick={onNew}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: T.primary, color: T.primaryFg, fontSize: 13, fontWeight: 500,
                    }}
                >
                    <Plus size={16} />
                    New conversation
                </button>
                <label style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
                    border: `1px solid ${T.border}`, background: T.bg,
                }}>
                    <Search size={14} style={{ color: T.mutedFg, flexShrink: 0 }} />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search conversations"
                        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: T.fg, width: '100%', fontFamily: 'inherit' }}
                    />
                </label>
            </div>

            <nav className="ac-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
                {groups.length === 0 && (
                    <div style={{ textAlign: 'center', fontSize: 13, color: T.mutedFg, padding: '32px 12px', lineHeight: 1.5 }}>
                        <MessageSquare size={20} style={{ opacity: 0.5, marginBottom: 6 }} />
                        <div>{query ? 'No matching conversations' : 'Your conversations will appear here'}</div>
                    </div>
                )}
                {groups.map(([label, items]) => (
                    <div key={label} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.mutedFg, padding: '10px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            {label}
                        </div>
                        {items.map(s => (
                            <SessionItem key={s.sessionId} session={s} isActive={s.sessionId === activeSessionId} onSelect={onSelect} onDelete={onDelete} />
                        ))}
                    </div>
                ))}
            </nav>
        </aside>
    );
}

function SessionItem({ session, isActive, onSelect, onDelete }: {
    session: SessionSummary;
    isActive: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [confirming, setConfirming] = useState(false);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(session.sessionId)}
            onKeyDown={e => e.key === 'Enter' && onSelect(session.sessionId)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setConfirming(false); }}
            style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                cursor: 'pointer', marginBottom: 1,
                background: isActive ? T.bg : hovered ? T.accent : 'transparent',
                boxShadow: isActive ? `0 0 0 1px ${T.border}` : 'none',
            }}
        >
            <span style={{
                flex: 1, minWidth: 0, fontSize: 13, color: T.fg, fontWeight: isActive ? 500 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
                {session.title || 'New conversation'}
            </span>
            {hovered ? (
                <button
                    type="button"
                    title={confirming ? 'Click again to delete' : 'Delete conversation'}
                    onClick={e => {
                        e.stopPropagation();
                        if (confirming) onDelete(session.sessionId);
                        else setConfirming(true);
                    }}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 6,
                        border: 'none', cursor: 'pointer', fontSize: 11,
                        background: confirming ? T.danger : 'transparent',
                        color: confirming ? '#fff' : T.mutedFg,
                    }}
                >
                    <Trash2 size={13} />
                    {confirming && 'Delete'}
                </button>
            ) : (
                <span style={{ fontSize: 11, color: T.mutedFg, flexShrink: 0 }}>{timeLabel(session.lastMessageAt || session.createdAt)}</span>
            )}
        </div>
    );
}
