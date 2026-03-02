import { OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { streamText } from 'ai';
import { RequestContext, TransactionalConnection, OrderService, CustomerService, ConfigService } from '@vendure/core';
import { type AiAssistantPluginOptions } from '../constants';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';
import type { AiChatProduct, AiChatCollection, AddToCartAction, AiChatOrder, AiActiveOrder, AiCartLine, SetShippingAddressAction, SetBillingAddressAction, SetShippingMethodAction, ChatResult, StreamingChatResult } from './types';
export type { AiChatProduct, AiChatCollection, AddToCartAction, AiChatOrder, AiActiveOrder, AiCartLine, SetShippingAddressAction, SetBillingAddressAction, SetShippingMethodAction, ChatResult, StreamingChatResult, };
export declare class AiChatService implements OnModuleInit {
    private options;
    private connection;
    private moduleRef;
    private embeddingService;
    private productEmbeddingService;
    private collectionEmbeddingService;
    private orderService;
    private customerService;
    private configService;
    private readonly logger;
    private openai;
    private fulltextSearchService;
    private assetUrlPrefix;
    private mapper;
    private searchTools;
    private cartTools;
    private orderTools;
    private checkoutTools;
    constructor(options: AiAssistantPluginOptions, connection: TransactionalConnection, moduleRef: ModuleRef, embeddingService: EmbeddingService, productEmbeddingService: ProductEmbeddingService, collectionEmbeddingService: CollectionEmbeddingService, orderService: OrderService, customerService: CustomerService, configService: ConfigService);
    onModuleInit(): Promise<void>;
    private buildTools;
    streamChat(ctx: RequestContext, userMessage: string, conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, customerId?: string | number): ReturnType<typeof streamText>;
    chat(ctx: RequestContext, userMessage: string, conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, customerId?: string | number): Promise<ChatResult>;
}
//# sourceMappingURL=ai-chat.service.d.ts.map