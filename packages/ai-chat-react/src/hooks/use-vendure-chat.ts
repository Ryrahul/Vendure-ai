import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import type { UseVendureChatOptions, ChatProduct, ChatCollection, ChatActiveOrder, ExtractedData } from '../types';
import { extractDataFromMessage, getMessageText } from '../utils/extract-data';

/** Generate a UUID v4 using the Web Crypto API (available in all modern browsers & Node 19+). */
function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

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
    /** The conversation ID for this chat session (stable across re-renders) */
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
    const { vendureUrl, authToken, chatEndpoint } = options;

    // Generate a stable conversationId once per hook mount.
    // useRef ensures the ID survives re-renders without changing.
    const conversationIdRef = useRef<string>(generateId());
    const conversationId = conversationIdRef.current;

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: chatEndpoint ?? `${vendureUrl.replace(/\/$/, '')}/ai-assistant/stream`,
                headers: authToken
                    ? () => ({ Authorization: `Bearer ${authToken}` })
                    : undefined,
                // Send the conversationId with every request so the server
                // can look up history from its cache instead of receiving it.
                body: { conversationId },
            }),
        [vendureUrl, authToken, chatEndpoint, conversationId],
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
        conversationId,
    };
}
