import type { AiAssistantPluginOptions } from '../constants';
export interface EmbeddingOptions {
    openaiApiKey: string;
    /** Model name, e.g. 'text-embedding-3-small' (default) or 'text-embedding-3-large' */
    model?: string;
}
/**
 * Generates text embeddings using OpenAI's embedding API.
 * Used to embed product name + description for semantic search.
 */
export declare class EmbeddingService {
    private client;
    private model;
    constructor(options: AiAssistantPluginOptions);
    /**
     * Generate embedding vector for the given text.
     * @returns Array of numbers (e.g. 1536 dims for text-embedding-3-small)
     */
    embed(text: string): Promise<number[]>;
}
//# sourceMappingURL=embedding.service.d.ts.map