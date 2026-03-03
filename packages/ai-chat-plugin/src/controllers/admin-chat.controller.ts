import { Body, Controller, Post, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { RequestContextService, SessionService } from '@vendure/core';
import { AdminAiChatService } from '../services/admin-ai-chat.service';

export interface AdminChatRequest {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AdminChatResponse {
    message: string;
}

/**
 * REST controller for the admin dashboard AI chat.
 * Uses AdminAiChatService with admin-specific tools (products, orders, customers, collections).
 */
@Controller('admin-ai-chat')
export class AdminChatController {
    private readonly logger = new Logger(AdminChatController.name);

    constructor(
        private adminAiChatService: AdminAiChatService,
        private requestContextService: RequestContextService,
        private sessionService: SessionService,
    ) {}

    @Post('chat')
    async chat(@Body() body: AdminChatRequest, @Req() req: Request): Promise<AdminChatResponse> {
        // Resolve admin session & request context
        const authHeader = req.get('Authorization');
        const tokenMatch = authHeader?.trim().match(/^bearer\s(.+)$/i);
        const sessionToken = tokenMatch?.[1];

        let session;
        if (sessionToken) {
            session = await this.sessionService.getSessionFromToken(sessionToken);
        }

        const ctx = await this.requestContextService.fromRequest(req, undefined, undefined, session);
        const message = (body.message ?? '').trim();
        const history = body.history ?? [];

        if (!message) {
            return {
                message: "Hi! I'm your store admin assistant. I can help you look up products, orders, customers, and collections. What would you like to know?",
            };
        }

        const result = await this.adminAiChatService.chat(ctx, message, history);
        return { message: result.message };
    }
}
