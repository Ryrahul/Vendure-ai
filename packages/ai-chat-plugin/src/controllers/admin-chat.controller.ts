import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { RequestContextService, SessionService, AdministratorService } from '@vendure/core';
import { AdminAiChatService, AdminChatResult } from '../services/admin-ai-chat.service';
import { AiChatHistoryService } from '../services/ai-chat-history.service';
import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions } from '../constants';

export interface AdminChatRequest {
    message: string;
    sessionId?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentPage?: string;
}

export interface AdminChatResponse extends AdminChatResult {
    sessionId?: string;
}

@Controller('admin-ai-chat')
export class AdminChatController {
    private readonly logger = new Logger(AdminChatController.name);

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private adminAiChatService: AdminAiChatService,
        private chatHistoryService: AiChatHistoryService,
        private requestContextService: RequestContextService,
        private sessionService: SessionService,
        private administratorService: AdministratorService,
    ) {}

    private async resolveAuth(req: Request) {
        const authHeader = req.get('Authorization');
        const tokenMatch = authHeader?.trim().match(/^bearer\s(.+)$/i);
        const sessionToken = tokenMatch?.[1];

        let session;
        if (sessionToken) {
            session = await this.sessionService.getSessionFromToken(sessionToken);
        }

        const ctx = await this.requestContextService.fromRequest(req, undefined, undefined, session);

        let administratorId: number | null = null;
        if (ctx.activeUserId) {
            try {
                const admins = await this.administratorService.findAll(ctx, { filter: { emailAddress: { contains: '' } } });
                const admin = admins.items.find(a => (a as any).user?.id === ctx.activeUserId);
                if (admin) administratorId = admin.id as number;
            } catch { /* ignore */ }
        }

        return { ctx, administratorId };
    }

    @Post('chat')
    async chat(@Body() body: AdminChatRequest, @Req() req: Request): Promise<AdminChatResponse> {
        const { ctx, administratorId } = await this.resolveAuth(req);

        const message = (body.message ?? '').trim();
        const history = body.history ?? [];
        const sessionId = body.sessionId || `admin-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        if (!message) {
            return {
                message: "Hi! I'm your store admin assistant. I can help you manage products, orders, customers, collections, and all store settings. What would you like to do?",
                products: [],
                collections: [],
                sessionId,
            };
        }

        // If sessionId was provided but no history, try to load from DB
        let effectiveHistory = history;
        if (body.sessionId && history.length === 0) {
            try {
                const existingSession = await this.chatHistoryService.getSession(body.sessionId);
                if (existingSession) {
                    effectiveHistory = existingSession.messages.map(m => ({
                        role: m.role,
                        content: m.content,
                    }));
                }
            } catch (e) {
                this.logger.warn(`Failed to load session history: ${e}`);
            }
        }

        const result = await this.adminAiChatService.chat(ctx, message, effectiveHistory, body.currentPage);

        // Persist chat turn to DB
        const model = this.options.azureOpenai ? this.options.azureOpenai.deploymentName : 'gpt-4o-mini';
        try {
            await this.chatHistoryService.appendMessage({
                sessionId,
                administratorId,
                channelId: ctx.channelId as number,
                model,
                userMessage: message,
                assistantMessage: result.message,
                inputTokens: result.usage?.inputTokens ?? 0,
                outputTokens: result.usage?.outputTokens ?? 0,
                products: result.products,
                collections: result.collections,
                orders: result.orders,
            });
        } catch (e) {
            this.logger.error(`Failed to persist chat session: ${e}`);
        }

        return { ...result, sessionId };
    }

    // ── Session management endpoints ──

    @Get('sessions')
    async listSessions(
        @Req() req: Request,
        @Query('take') take?: string,
        @Query('skip') skip?: string,
    ) {
        const { administratorId } = await this.resolveAuth(req);
        return this.chatHistoryService.listSessions({
            administratorId: administratorId ?? undefined,
            take: take ? parseInt(take, 10) : 50,
            skip: skip ? parseInt(skip, 10) : 0,
        });
    }

    @Get('sessions/:sessionId')
    async getSession(@Param('sessionId') sessionId: string) {
        return this.chatHistoryService.getSession(sessionId);
    }

    @Delete('sessions/:sessionId')
    async deleteSession(@Param('sessionId') sessionId: string) {
        const deleted = await this.chatHistoryService.deleteSession(sessionId);
        return { success: deleted };
    }
}
