import { Injectable, Logger } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { AiChatSession, AiChatMessageEntry } from '../entities/ai-chat-session.entity';

export interface AppendMessageInput {
    sessionId: string;
    administratorId?: number | null;
    channelId?: number | null;
    model: string;
    userMessage: string;
    assistantMessage: string;
    inputTokens: number;
    outputTokens: number;
    products?: any[];
    collections?: any[];
    orders?: any[];
}

@Injectable()
export class AiChatHistoryService {
    private readonly logger = new Logger(AiChatHistoryService.name);

    constructor(private connection: TransactionalConnection) {}

    async appendMessage(input: AppendMessageInput): Promise<AiChatSession> {
        const repo = this.connection.rawConnection.getRepository(AiChatSession);

        let session = await repo.findOne({ where: { sessionId: input.sessionId } });
        const now = new Date();

        const userEntry: AiChatMessageEntry = {
            role: 'user',
            content: input.userMessage,
            timestamp: now.toISOString(),
        };

        const assistantEntry: AiChatMessageEntry = {
            role: 'assistant',
            content: input.assistantMessage,
            timestamp: now.toISOString(),
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            ...(input.products?.length ? { products: input.products } : {}),
            ...(input.collections?.length ? { collections: input.collections } : {}),
            ...(input.orders?.length ? { orders: input.orders } : {}),
        };

        if (!session) {
            const title = input.userMessage.length > 80
                ? input.userMessage.substring(0, 77) + '...'
                : input.userMessage;

            session = repo.create({
                sessionId: input.sessionId,
                administratorId: input.administratorId ?? null,
                channelId: input.channelId ?? null,
                title,
                messages: [userEntry, assistantEntry],
                messageCount: 2,
                totalInputTokens: input.inputTokens,
                totalOutputTokens: input.outputTokens,
                model: input.model,
                isActive: true,
                lastMessageAt: now,
            });
        } else {
            session.messages = [...session.messages, userEntry, assistantEntry];
            session.messageCount = session.messages.length;
            session.totalInputTokens += input.inputTokens;
            session.totalOutputTokens += input.outputTokens;
            session.lastMessageAt = now;
            if (input.model) session.model = input.model;
        }

        return repo.save(session);
    }

    async getSession(sessionId: string): Promise<AiChatSession | null> {
        const repo = this.connection.rawConnection.getRepository(AiChatSession);
        return repo.findOne({ where: { sessionId } }) ?? null;
    }

    /** Lists one administrator's sessions. The owner filter is mandatory. */
    async listSessions(opts: {
        administratorId: number;
        take?: number;
        skip?: number;
    }): Promise<{ items: AiChatSession[]; totalItems: number }> {
        const repo = this.connection.rawConnection.getRepository(AiChatSession);
        const qb = repo.createQueryBuilder('s').orderBy('s.lastMessageAt', 'DESC');

        qb.andWhere('s.administratorId = :adminId', { adminId: opts.administratorId });

        const totalItems = await qb.getCount();
        const items = await qb
            .take(opts.take ?? 50)
            .skip(opts.skip ?? 0)
            .getMany();

        return { items, totalItems };
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        const repo = this.connection.rawConnection.getRepository(AiChatSession);
        const result = await repo.delete({ sessionId });
        return (result.affected ?? 0) > 0;
    }
}
