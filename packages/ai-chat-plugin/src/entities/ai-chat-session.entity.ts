import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index } from 'typeorm';
import { VendureEntity } from '@vendure/core';

export interface AiChatMessageEntry {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    inputTokens?: number;
    outputTokens?: number;
    products?: any[];
    collections?: any[];
    orders?: any[];
    /** Charts/tables/sources shown under the reply. */
    insights?: any[];
}

@Entity('ai_chat_session')
export class AiChatSession extends VendureEntity {
    constructor(input?: DeepPartial<AiChatSession>) {
        super(input);
    }

    @Column({ type: 'varchar', unique: true })
    @Index()
    sessionId: string;

    @Column({ type: 'int', nullable: true })
    @Index()
    administratorId: number | null;

    @Column({ type: 'int', nullable: true })
    channelId: number | null;

    @Column({ type: 'varchar', length: 255, default: '' })
    title: string;

    @Column({ type: 'jsonb', default: '[]' })
    messages: AiChatMessageEntry[];

    @Column({ type: 'int', default: 0 })
    messageCount: number;

    @Column({ type: 'int', default: 0 })
    totalInputTokens: number;

    @Column({ type: 'int', default: 0 })
    totalOutputTokens: number;

    @Column({ type: 'varchar', length: 100, default: '' })
    model: string;

    @Column({ type: 'boolean', default: true })
    @Index()
    isActive: boolean;

    @Column({ type: 'timestamp', nullable: true })
    lastMessageAt: Date | null;
}
