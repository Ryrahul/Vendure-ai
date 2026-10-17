import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, PendingConfirmation } from '../types';

function authHeaders(json = false): Record<string, string> {
    const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
    const sessionToken = localStorage.getItem('vendure-session-token');
    const channelToken = localStorage.getItem('vendure-selected-channel-token');
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    if (channelToken) headers['vendure-token'] = channelToken;
    return headers;
}

function generateSessionId(): string {
    return `admin-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function useAdminChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>(generateSessionId);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const newConversation = useCallback(() => {
        setMessages([]);
        setSessionId(generateSessionId());
    }, []);

    /** Load a previous session from the server. */
    const loadSession = useCallback(async (sid: string) => {
        try {
            const sessionToken = localStorage.getItem('vendure-session-token');
            const channelToken = localStorage.getItem('vendure-selected-channel-token');
            const headers: Record<string, string> = {};
            if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
            if (channelToken) headers['vendure-token'] = channelToken;

            const res = await fetch(`/admin-ai-chat/sessions/${sid}`, { headers, credentials: 'include' });
            if (!res.ok) return;
            const session = await res.json();
            if (!session?.messages) return;

            setSessionId(sid);
            setMessages(
                session.messages.map((m: any, i: number) => ({
                    id: `${m.role[0]}-${i}-${Date.now()}`,
                    role: m.role,
                    content: m.content,
                    ...(m.products?.length ? { products: m.products } : {}),
                    ...(m.collections?.length ? { collections: m.collections } : {}),
                    ...(m.orders?.length ? { orders: m.orders } : {}),
                })),
            );
        } catch {
            // ignore
        }
    }, []);

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
                const sessionToken = localStorage.getItem('vendure-session-token');
                const channelToken = localStorage.getItem('vendure-selected-channel-token');
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
                if (channelToken) headers['vendure-token'] = channelToken;

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

                // Server may return a sessionId (first turn creates it)
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
                        pendingConfirmations: (data.pendingConfirmations ?? []).map((c: PendingConfirmation) => ({
                            ...c,
                            status: 'pending',
                        })),
                    },
                ]);

                // Handle navigation instruction from AI
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
        [isLoading, messages, sessionId],
    );

    /**
     * Confirms or cancels an action the assistant requested. This is the only way a
     * destructive action runs: the model itself cannot call this endpoint.
     */
    const resolveConfirmation = useCallback(
        async (messageId: string, confirmationId: string, decision: 'confirm' | 'cancel') => {
            const update = (patch: Partial<PendingConfirmation>) =>
                setMessages(prev =>
                    prev.map(m =>
                        m.id !== messageId
                            ? m
                            : {
                                  ...m,
                                  pendingConfirmations: m.pendingConfirmations?.map(c =>
                                      c.id === confirmationId ? { ...c, ...patch } : c,
                                  ),
                              },
                    ),
                );
            update({ status: 'working' });
            try {
                const res = await fetch(`/admin-ai-chat/${decision}`, {
                    method: 'POST',
                    headers: authHeaders(true),
                    credentials: 'include',
                    body: JSON.stringify({ confirmationId }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    update({ status: 'failed', result: data?.message ?? 'This action expired or was already handled.' });
                } else if (decision === 'cancel') {
                    update({ status: 'cancelled', result: 'Cancelled — nothing was changed.' });
                } else {
                    update({ status: data.success ? 'confirmed' : 'failed', result: data.summary });
                }
            } catch (err) {
                update({ status: 'failed', result: err instanceof Error ? err.message : 'Request failed' });
            }
        },
        [],
    );

    return {
        messages,
        input,
        resolveConfirmation,
        setInput,
        isLoading,
        scrollRef,
        sendMessage,
        sessionId,
        newConversation,
        loadSession,
    };
}
