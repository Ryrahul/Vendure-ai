import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequestContextService, CustomerService } from '@vendure/core';
import { AiChatService, AiChatProduct, AiChatCollection, AddToCartAction, AiChatOrder } from '../services/ai-chat.service';

export type { AiChatProduct, AiChatCollection, AddToCartAction, AiChatOrder } from '../services/ai-chat.service';

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
    orders?: AiChatOrder[];
}

/**
 * REST endpoint for the AI shopping assistant.
 * Uses OpenAI chat completions with tool calling for intelligent product discovery.
 * Requires an authenticated customer session (bearer token or cookie).
 */
@Controller('ai-assistant')
export class AiAssistantController {
    constructor(
        private requestContextService: RequestContextService,
        private customerService: CustomerService,
        private aiChatService: AiChatService,
    ) {}

    @Post('chat')
    async chat(@Body() body: AiChatRequest, @Req() req: Request): Promise<AiChatResponse> {
        // Create an authenticated RequestContext from the incoming request
        const ctx = await this.requestContextService.fromRequest(req);

        // Resolve the active customer from the session
        let customerId: string | number | undefined;
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            customerId = customer?.id;
        }

        if (!customerId) {
            return {
                message: 'Please log in to use the shopping assistant. I need to know who you are to help you with orders and your cart.',
                products: [],
                collections: [],
            };
        }

        const query = (body?.message ?? '').trim();

        if (!query) {
            return {
                message: 'Hi! I\'m your shopping assistant. How can I help you today? You can ask me about products, collections, your orders, or anything about our store.',
                products: [],
                collections: [],
            };
        }

        // Convert frontend history to OpenAI message format
        const history = (body.history ?? []).map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        }));

        const result = await this.aiChatService.chat(ctx, query, history, customerId);

        return {
            message: result.message,
            products: result.products,
            collections: result.collections,
            addToCartAction: result.addToCartAction,
            orders: result.orders,
        };
    }
}
