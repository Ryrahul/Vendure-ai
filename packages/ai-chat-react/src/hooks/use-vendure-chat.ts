import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import type { UseVendureChatOptions, ChatProduct, ChatCollection, ChatActiveOrder, ExtractedData } from '../types';
import { extractDataFromMessage, getMessageText } from '../utils/extract-data';

export interface UseVendureChatReturn {
    /** All chat messages */
    messages: UIMessage[];
    /** Current chat status */
    status: 'ready' | 'streaming' | 'submitted' | 'error';
    /** Send a text message */
    sendMessage: (text: string) => Promise<void>;
    /** Whether the chat is currently loading/streaming */
    isLoading: boolean;
    /** Get text content from a message */
    getMessageText: (msg: UIMessage) => string;
    /** Get extracted structured data from a message */
    getMessageData: (msg: UIMessage) => ExtractedData;
    /** Products from the latest assistant response */
    products: ChatProduct[];
    /** Collections from the latest assistant response */
    collections: ChatCollection[];
    /** Active order from the latest assistant response */
    activeOrder: ChatActiveOrder | undefined;
    /** The conversation ID (random per visitor, created on the first message; empty before that) */
    conversationId: string;
}

/**
 * Headless hook for Vendure AI chat.
 * Provides full control over the chat UI while handling transport and data extraction.
 *
 * A stable `conversationId` is generated once per hook instance and sent with
 * every request so the server can cache conversation history instead of
 * requiring the full message array from the frontend each time.
 */
export function useVendureChat(options: UseVendureChatOptions): UseVendureChatReturn {
    const { vendureUrl, authToken, chatEndpoint, channelToken } = options;

    // The conversation id must be unique per visitor: the server caches history under it.
    // It is created lazily on the first request (an event handler, not render), which keeps
    // it random while staying compatible with Next.js prerendering rules that reject
    // Math.random() / crypto.randomUUID() during render. Never use useId() here — it is
    // identical for every visitor rendering the same component tree.
    const conversationIdRef = useRef<string | null>(null);
    const getConversationId = () => (conversationIdRef.current ??= createConversationId());

    // useChat keeps the transport from its first render, so the tokens are read through refs:
    // a shopper who gets a session (e.g. after adding to cart) or logs in is then recognised
    // on the next message, and the assistant sees the same cart as the storefront.
    const authTokenRef = useRef(authToken);
    authTokenRef.current = authToken;
    const channelTokenRef = useRef(channelToken);
    channelTokenRef.current = channelToken;

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: chatEndpoint ?? `${vendureUrl.replace(/\/$/, '')}/ai-assistant/stream`,
                headers: () => ({
                    ...(authTokenRef.current ? { Authorization: `Bearer ${authTokenRef.current}` } : {}),
                    ...(channelTokenRef.current ? { 'vendure-token': channelTokenRef.current } : {}),
                }),
                // Send the conversationId with every request so the server
                // can look up history from its cache instead of receiving it.
                body: () => ({ conversationId: getConversationId() }),
            }),
        [vendureUrl, chatEndpoint],
    );

    const { messages, sendMessage: rawSendMessage, status } = useChat({
        id: 'vendure-ai-chat',
        transport,
    });

    const isLoading = status === 'submitted' || status === 'streaming';

    // Extract data from the latest assistant message
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
    const latestData = lastAssistantMsg ? extractDataFromMessage(lastAssistantMsg) : { products: [], collections: [] };

    const sendMessage = async (text: string) => {
        if (!text.trim() || isLoading) return;
        await rawSendMessage({ text: text.trim() });
    };

    return {
        messages,
        status,
        sendMessage,
        isLoading,
        getMessageText,
        getMessageData: extractDataFromMessage,
        products: latestData.products,
        collections: latestData.collections,
        activeOrder: latestData.activeOrder,
        conversationId: conversationIdRef.current ?? '',
    };
}

function createConversationId(): string {
    const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (cryptoApi?.getRandomValues) {
        cryptoApi.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
