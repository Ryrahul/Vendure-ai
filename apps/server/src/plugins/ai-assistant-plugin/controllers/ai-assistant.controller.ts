import { Body, Controller, Post, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { RequestContextService, CustomerService, SessionService, ConfigService } from '@vendure/core';
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
 * Works for anonymous users (product search, browsing, cart).
 * Order history/tracking requires an authenticated customer session.
 */
@Controller('ai-assistant')
export class AiAssistantController {
    private readonly logger = new Logger(AiAssistantController.name);

    constructor(
        private requestContextService: RequestContextService,
        private customerService: CustomerService,
        private sessionService: SessionService,
        private configService: ConfigService,
        private aiChatService: AiChatService,
    ) {}

    @Post('chat')
    async chat(@Body() body: AiChatRequest, @Req() req: Request): Promise<AiChatResponse> {
        // Extract session token from the request (bearer or cookie)
        const authHeader = req.get('Authorization');
        const tokenMatch = authHeader?.trim().match(/^bearer\s(.+)$/i);
        const sessionToken = tokenMatch?.[1];

        this.logger.log(`[AUTH] Session token present: ${!!sessionToken}`);

        // Look up the session and create an authenticated RequestContext
        let session;
        if (sessionToken) {
            session = await this.sessionService.getSessionFromToken(sessionToken);
            this.logger.log(`[AUTH] Session found: ${!!session}, userId: ${session?.user?.id ?? 'NONE'}`);
        }

        const ctx = await this.requestContextService.fromRequest(req, undefined, undefined, session);
        this.logger.log(`[AUTH] ctx.activeUserId: ${ctx.activeUserId ?? 'NONE'}`);

        // Try to resolve the active customer — optional, only needed for order tools
        let customerId: string | number | undefined;
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            customerId = customer?.id;
            this.logger.log(`[AUTH] customerId: ${customerId ?? 'NONE'}`);
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
