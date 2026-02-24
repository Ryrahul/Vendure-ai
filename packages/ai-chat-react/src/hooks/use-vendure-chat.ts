import { useMemo } from 'react';
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
}

/**
 * Headless hook for Vendure AI chat.
 * Provides full control over the chat UI while handling transport and data extraction.
 */
export function useVendureChat(options: UseVendureChatOptions): UseVendureChatReturn {
    const { vendureUrl, authToken, chatEndpoint } = options;

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: chatEndpoint ?? `${vendureUrl.replace(/\/$/, '')}/ai-assistant/stream`,
                headers: authToken
                    ? () => ({ Authorization: `Bearer ${authToken}` })
                    : undefined,
            }),
        [vendureUrl, authToken, chatEndpoint],
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
    };
}
