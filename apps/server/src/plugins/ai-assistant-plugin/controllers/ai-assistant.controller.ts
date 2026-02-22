import { Body, Controller, Post } from '@nestjs/common';
import { RequestContextService } from '@vendure/core';
import { AiChatService, AiChatProduct, AiChatCollection, AddToCartAction } from '../services/ai-chat.service';

export type { AiChatProduct, AiChatCollection, AddToCartAction } from '../services/ai-chat.service';

export interface AiChatRequest {
    message: string;
    /** Conversation history from the frontend for multi-turn context */
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AiChatResponse {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    addToCartAction?: AddToCartAction;
}

/**
 * REST endpoint for the AI shopping assistant.
 * Uses OpenAI chat completions with tool calling for intelligent product discovery.
 */
@Controller('ai-assistant')
export class AiAssistantController {
    constructor(
        private requestContextService: RequestContextService,
        private aiChatService: AiChatService,
    ) {}

    @Post('chat')
    async chat(@Body() body: AiChatRequest): Promise<AiChatResponse> {
        const ctx = await this.requestContextService.create({ apiType: 'shop' });
        const query = (body?.message ?? '').trim();

        if (!query) {
            return {
                message: 'Hi! I\'m your shopping assistant. How can I help you today? You can ask me about products, collections, or anything about our store.',
                products: [],
                collections: [],
            };
        }

        // Convert frontend history to OpenAI message format
        const history = (body.history ?? []).map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        }));

        const result = await this.aiChatService.chat(ctx, query, history);

        return {
            message: result.message,
            products: result.products,
            collections: result.collections,
            addToCartAction: result.addToCartAction,
        };
    }
}
