import { useState, useEffect, useCallback } from 'react';

export interface SessionSummary {
    sessionId: string;
    title: string;
    messageCount: number;
    model: string;
    isActive: boolean;
    lastMessageAt: string | null;
    createdAt: string;
}

function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const sessionToken = localStorage.getItem('vendure-session-token');
    const channelToken = localStorage.getItem('vendure-selected-channel-token');
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    if (channelToken) headers['vendure-token'] = channelToken;
    return headers;
}

export function useSessionList() {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/admin-ai-chat/sessions?take=50', {
                headers: getHeaders(),
                credentials: 'include',
            });
            if (!res.ok) return;
            const data = await res.json();
            setSessions(
                (data.items ?? []).map((s: any) => ({
                    sessionId: s.sessionId,
                    title: s.title,
                    messageCount: s.messageCount,
                    model: s.model,
                    isActive: s.isActive,
                    lastMessageAt: s.lastMessageAt,
                    createdAt: s.createdAt,
                })),
            );
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteSession = useCallback(async (sessionId: string) => {
        try {
            await fetch(`/admin-ai-chat/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: getHeaders(),
                credentials: 'include',
            });
            setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    return { sessions, loading, refresh, deleteSession };
}
