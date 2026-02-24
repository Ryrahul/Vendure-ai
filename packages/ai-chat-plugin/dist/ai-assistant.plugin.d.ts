import { OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { ProductEmbeddingHandler } from './handlers/product-embedding-handler';
import { VariantEmbeddingHandler } from './handlers/variant-embedding-handler';
import { CollectionEmbeddingHandler } from './handlers/collection-embedding-handler';
import { type AiAssistantPluginOptions } from './constants';
export type { AiAssistantPluginOptions } from './constants';
export declare class AiAssistantPlugin implements OnApplicationBootstrap {
    private eventBus;
    private productHandler;
    private variantHandler;
    private collectionHandler;
    static options: AiAssistantPluginOptions;
    static init(options: AiAssistantPluginOptions): typeof AiAssistantPlugin;
    constructor(eventBus: EventBus, productHandler: ProductEmbeddingHandler, variantHandler: VariantEmbeddingHandler, collectionHandler: CollectionEmbeddingHandler);
    onApplicationBootstrap(): void;
}
//# sourceMappingURL=ai-assistant.plugin.d.ts.map