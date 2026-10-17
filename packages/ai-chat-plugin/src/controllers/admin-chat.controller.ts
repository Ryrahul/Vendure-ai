import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    Inject,
    Logger,
    NotFoundException,
    Param,
    Post,
    Query,
} from '@nestjs/common';
import { AdministratorService, Allow, Ctx, ID, RequestContext } from '@vendure/core';
import { randomUUID } from 'crypto';

import {
    AI_ASSISTANT_OPTIONS,
    aiAdminAssistantPermission,
    sanitizeHistory,
    type AiAssistantPluginOptions,
} from '../constants';
import { AdminAiChatService, AdminChatResult, ConfirmedActionResult } from '../services/admin-ai-chat.service';
import { AdminConfirmationService } from '../services/admin-confirmation.service';
import { ChatLimitsService } from '../services/chat-limits.service';
import { AiChatHistoryService } from '../services/ai-chat-history.service';

export interface AdminChatRequest {
    message: string;
    sessionId?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentPage?: string;
}

export interface AdminChatResponse extends AdminChatResult {
    sessionId?: string;
}

export interface AdminConfirmRequest {
    confirmationId: string;
}

const MAX_ADMIN_MESSAGE_LENGTH = 8000;

/**
 * REST endpoints for the AI admin assistant.
 *
 * Every route requires the `UseAiAdminAssistant` permission, checked by Vendure's own
 * AuthGuard (Bearer token or session cookie, `vendure-token` channel header). On top of
 * that, each admin tool requires the permission of the equivalent Admin API operation in
 * the active channel, and chat sessions are only visible to the administrator who owns them.
 */
@Controller('admin-ai-chat')
export class AdminChatController {
    private readonly logger = new Logger(AdminChatController.name);

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private adminAiChatService: AdminAiChatService,
        private chatHistoryService: AiChatHistoryService,
        private administratorService: AdministratorService,
        private confirmations: AdminConfirmationService,
        private chatLimits: ChatLimitsService,
    ) {}

    @Post('chat')
    @Allow(aiAdminAssistantPermission.Permission)
    async chat(@Ctx() ctx: RequestContext, @Body() body: AdminChatRequest): Promise<AdminChatResponse> {
        const administratorId = await this.requireAdministratorId(ctx);
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (message.length > MAX_ADMIN_MESSAGE_LENGTH) {
            throw new ForbiddenException(`Message too long (max ${MAX_ADMIN_MESSAGE_LENGTH} characters)`);
        }

        // A client-supplied sessionId is only honoured if it belongs to this administrator.
        const existingSession = body.sessionId ? await this.findOwnSession(body.sessionId, administratorId) : undefined;
        const sessionId = existingSession ? existingSession.sessionId : `admin-${randomUUID()}`;

        if (!message) {
            return {
                message: "Hi! I'm your store admin assistant. I can help you manage products, orders, customers, collections, and all store settings. What would you like to do?",
                products: [],
                collections: [],
                sessionId,
            };
        }

        const maxHistory = this.options.maxHistoryMessages ?? 20;
        const history = existingSession
            ? sanitizeHistory(existingSession.messages, maxHistory)
            : sanitizeHistory(body.history, maxHistory);

        await this.chatLimits.checkBeforeChat('admin', `admin:${administratorId}`);
        const result = await this.adminAiChatService.chat(ctx, message, history, body.currentPage, {
            administratorId,
            sessionId,
        });

        await this.chatLimits.recordUsage('admin', `admin:${administratorId}`, result.usage?.totalTokens);

        const model = this.options.azureOpenai ? this.options.azureOpenai.deploymentName : (this.options.chatModel ?? 'gpt-4o-mini');
        try {
            await this.chatHistoryService.appendMessage({
                sessionId,
                administratorId: administratorId as number,
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

    /**
     * Runs an action the assistant requested, after the administrator pressed Confirm.
     * Only the administrator who requested it can confirm, once, within 10 minutes.
     */
    @Post('confirm')
    @Allow(aiAdminAssistantPermission.Permission)
    async confirm(@Ctx() ctx: RequestContext, @Body() body: AdminConfirmRequest): Promise<ConfirmedActionResult> {
        const administratorId = await this.requireAdministratorId(ctx);
        const action = await this.confirmations.take(administratorId, body?.confirmationId);
        if (!action) {
            throw new NotFoundException('This action has expired or was already handled. Ask the assistant again.');
        }
        const result = await this.adminAiChatService.executeConfirmed(ctx, action);
        await this.recordOutcome(ctx, administratorId, action.sessionId, `Confirmed: ${action.description}`, result.summary);
        return result;
    }

    /** Discards an action the assistant requested. */
    @Post('cancel')
    @Allow(aiAdminAssistantPermission.Permission)
    async cancel(@Ctx() ctx: RequestContext, @Body() body: AdminConfirmRequest): Promise<{ success: boolean }> {
        const administratorId = await this.requireAdministratorId(ctx);
        const action = await this.confirmations.take(administratorId, body?.confirmationId);
        if (!action) {
            throw new NotFoundException('This action has expired or was already handled.');
        }
        await this.recordOutcome(ctx, administratorId, action.sessionId, `Cancelled: ${action.description}`, 'Cancelled — nothing was changed.');
        return { success: true };
    }

    /** Adds the outcome to the chat session so the assistant knows it on the next turn. */
    private async recordOutcome(ctx: RequestContext, administratorId: ID, sessionId: string | undefined, userMessage: string, assistantMessage: string) {
        if (!sessionId || !(await this.findOwnSession(sessionId, administratorId))) {
            return;
        }
        try {
            await this.chatHistoryService.appendMessage({
                sessionId,
                administratorId: administratorId as number,
                channelId: ctx.channelId as number,
                model: 'confirmation',
                userMessage,
                assistantMessage,
                inputTokens: 0,
                outputTokens: 0,
            });
        } catch (e) {
            this.logger.error(`Failed to record confirmation outcome: ${e}`);
        }
    }

    @Get('sessions')
    @Allow(aiAdminAssistantPermission.Permission)
    async listSessions(@Ctx() ctx: RequestContext, @Query('take') take?: string, @Query('skip') skip?: string) {
        const administratorId = await this.requireAdministratorId(ctx);
        return this.chatHistoryService.listSessions({
            administratorId: administratorId as number,
            take: Math.min(Math.max(parseInt(take ?? '50', 10) || 50, 1), 100),
            skip: Math.max(parseInt(skip ?? '0', 10) || 0, 0),
        });
    }

    @Get('sessions/:sessionId')
    @Allow(aiAdminAssistantPermission.Permission)
    async getSession(@Ctx() ctx: RequestContext, @Param('sessionId') sessionId: string) {
        const administratorId = await this.requireAdministratorId(ctx);
        const session = await this.findOwnSession(sessionId, administratorId);
        if (!session) {
            throw new NotFoundException();
        }
        return session;
    }

    @Delete('sessions/:sessionId')
    @Allow(aiAdminAssistantPermission.Permission)
    async deleteSession(@Ctx() ctx: RequestContext, @Param('sessionId') sessionId: string) {
        const administratorId = await this.requireAdministratorId(ctx);
        if (!(await this.findOwnSession(sessionId, administratorId))) {
            throw new NotFoundException();
        }
        return { success: await this.chatHistoryService.deleteSession(sessionId) };
    }

    private async requireAdministratorId(ctx: RequestContext): Promise<ID> {
        const admin = ctx.activeUserId ? await this.administratorService.findOneByUserId(ctx, ctx.activeUserId) : undefined;
        if (!admin) {
            throw new ForbiddenException('The AI admin assistant is only available to administrators');
        }
        return admin.id;
    }

    /** Returns the session only if it exists and belongs to the administrator (no existence oracle). */
    private async findOwnSession(sessionId: string, administratorId: ID) {
        const session = await this.chatHistoryService.getSession(sessionId);
        return session && String(session.administratorId) === String(administratorId) ? session : undefined;
    }
}
