import { Body, Controller, Post, Req, Res, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContextService, CustomerService, SessionService, ConfigService } from '@vendure/core';
import {
    AiChatService,
    AiChatProduct,
    AiChatCollection,
    AddToCartAction,
    AiChatOrder,
    AiActiveOrder,
    AiCartLine,
    SetShippingAddressAction,
    SetBillingAddressAction,
    SetShippingMethodAction,
} from '../services/ai-chat.service';

export type {
    AiChatProduct,
    AiChatCollection,
    AddToCartAction,
    AiChatOrder,
    AiActiveOrder,
    AiCartLine,
    SetShippingAddressAction,
    SetBillingAddressAction,
    SetShippingMethodAction,
} from '../services/ai-chat.service';

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

    /**
     * Helper: extract auth context from request
     */
    private async resolveAuthContext(req: Request) {
        const authHeader = req.get('Authorization');
        const tokenMatch = authHeader?.trim().match(/^bearer\s(.+)$/i);
        const sessionToken = tokenMatch?.[1];

        this.logger.log(`[AUTH] Session token present: ${!!sessionToken}`);

        let session;
        if (sessionToken) {
            session = await this.sessionService.getSessionFromToken(sessionToken);
            this.logger.log(`[AUTH] Session found: ${!!session}, userId: ${session?.user?.id ?? 'NONE'}`);
        }

        const ctx = await this.requestContextService.fromRequest(req, undefined, undefined, session);
        this.logger.log(`[AUTH] ctx.activeUserId: ${ctx.activeUserId ?? 'NONE'}`);

        let customerId: string | number | undefined;
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            customerId = customer?.id;
            this.logger.log(`[AUTH] customerId: ${customerId ?? 'NONE'}`);
        }

        return { ctx, customerId };
    }

    /**
     * Non-streaming endpoint (backward compatible).
     * Returns the full JSON response after all tool calls complete.
     */
    @Post('chat')
    async chat(@Body() body: AiChatRequest, @Req() req: Request): Promise<AiChatResponse> {
        const { ctx, customerId } = await this.resolveAuthContext(req);

        const query = (body?.message ?? '').trim();
        if (!query) {
            return {
                message: 'Hi! I\'m your shopping assistant. How can I help you today? You can ask me about products, collections, your orders, or anything about our store.',
                products: [],
                collections: [],
            };
        }

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
            activeOrder: result.activeOrder,
            setShippingAddressAction: result.setShippingAddressAction,
            setBillingAddressAction: result.setBillingAddressAction,
            setShippingMethodAction: result.setShippingMethodAction,
        };
    }

    /**
     * Streaming endpoint.
     * Returns a Vercel AI SDK–compatible data stream.
     * The frontend can consume this with useChat() from @ai-sdk/react.
     *
     * Structured data (products, collections, cart, orders, actions) is sent
     * as data stream annotations (custom JSON messages) alongside the text stream.
     */
    @Post('stream')
    async stream(@Body() body: AiChatRequest, @Req() req: Request, @Res() res: Response): Promise<void> {
        const { ctx, customerId } = await this.resolveAuthContext(req);

        const query = (body?.message ?? '').trim();
        if (!query) {
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json({
                message: 'Hi! I\'m your shopping assistant. How can I help you today?',
                products: [],
                collections: [],
            });
            return;
        }

        const history = (body.history ?? []).map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        }));

        const streamResult = this.aiChatService.streamChat(ctx, query, history, customerId);

        // Use the AI SDK's toUIMessageStreamResponse for useChat() compatibility
        const streamResponse = streamResult.toUIMessageStreamResponse();

        // Forward status and headers
        res.status(streamResponse.status ?? 200);
        streamResponse.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
        });

        // Pipe the body stream to the express response
        if (streamResponse.body) {
            const reader = streamResponse.body.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
                }
            } catch (e) {
                this.logger.error(`Stream error: ${e}`);
            } finally {
                res.end();
            }
        } else {
            res.end();
        }
    }
}
