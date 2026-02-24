import { Request, Response } from 'express';
import { RequestContextService, CustomerService, SessionService, ConfigService } from '@vendure/core';
import { AiChatService, AiChatProduct, AiChatCollection, AddToCartAction, AiChatOrder, AiActiveOrder, SetShippingAddressAction, SetBillingAddressAction, SetShippingMethodAction } from '../services/ai-chat.service';
export type { AiChatProduct, AiChatCollection, AddToCartAction, AiChatOrder, AiActiveOrder, AiCartLine, SetShippingAddressAction, SetBillingAddressAction, SetShippingMethodAction, } from '../services/ai-chat.service';
export interface AiChatRequest {
    /** Direct message (simple format) */
    message?: string;
    /** Conversation history from the frontend for multi-turn context (simple format) */
    history?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    /** AI SDK UIMessage array (sent by DefaultChatTransport / useChat()) */
    messages?: Array<{
        role: string;
        content?: string;
        parts?: Array<{
            type: string;
            text?: string;
            [key: string]: unknown;
        }>;
        [key: string]: unknown;
    }>;
}
export interface AiChatResponse {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    addToCartAction?: AddToCartAction;
    orders?: AiChatOrder[];
    activeOrder?: AiActiveOrder;
    setShippingAddressAction?: SetShippingAddressAction;
    setBillingAddressAction?: SetBillingAddressAction;
    setShippingMethodAction?: SetShippingMethodAction;
}
/**
 * REST endpoints for the AI shopping assistant.
 * - POST /ai-assistant/chat — non-streaming JSON response (backward compatible)
 * - POST /ai-assistant/stream — streaming response using Vercel AI SDK data stream protocol
 */
export declare class AiAssistantController {
    private requestContextService;
    private customerService;
    private sessionService;
    private configService;
    private aiChatService;
    private readonly logger;
    constructor(requestContextService: RequestContextService, customerService: CustomerService, sessionService: SessionService, configService: ConfigService, aiChatService: AiChatService);
    /**
     * Helper: extract user message and conversation history from the request body.
     * Supports two formats:
     * 1. Simple: { message: "hello", history: [{role, content}] }
     * 2. AI SDK: { messages: [UIMessage, ...] } (sent by DefaultChatTransport / useChat())
     */
    private extractMessageAndHistory;
    /** Extract plain text from a UIMessage (handles both parts and content) */
    private getTextFromUIMessage;
    /** Extract assistant text + tool result summaries for conversation context */
    private getAssistantTextWithToolContext;
    /**
     * Helper: extract auth context from request
     */
    private resolveAuthContext;
    /**
     * Non-streaming endpoint (backward compatible).
     * Returns the full JSON response after all tool calls complete.
     */
    chat(body: AiChatRequest, req: Request): Promise<AiChatResponse>;
    /**
     * Streaming endpoint.
     * Returns a Vercel AI SDK–compatible data stream.
     * The frontend can consume this with useChat() from @ai-sdk/react.
     *
     * Structured data (products, collections, cart, orders, actions) is sent
     * as data stream annotations (custom JSON messages) alongside the text stream.
     */
    stream(body: AiChatRequest, req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=ai-assistant.controller.d.ts.map