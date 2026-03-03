import { Body, Controller, Post, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { RequestContextService, SessionService } from '@vendure/core';
import { AdminAiChatService, AdminChatResult } from '../services/admin-ai-chat.service';

export interface AdminChatRequest {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AdminChatResponse extends AdminChatResult {}

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
                products: [],
                collections: [],
            };
        }

        return this.adminAiChatService.chat(ctx, message, history);
    }
}
