import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../types';

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

    return {
        messages,
        input,
        setInput,
        isLoading,
        scrollRef,
        sendMessage,
        sessionId,
        newConversation,
        loadSession,
    };
}
