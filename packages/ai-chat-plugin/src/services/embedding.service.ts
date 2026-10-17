import { Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AI_ASSISTANT_OPTIONS } from '../constants';
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
@Injectable()
export class EmbeddingService {
    private client: OpenAI;
    readonly model: string;

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) options: AiAssistantPluginOptions,
    ) {
        this.client = new OpenAI({ apiKey: options.openaiApiKey });
        this.model = options.embeddingModel ?? 'text-embedding-3-small';
    }

    /**
     * Generate embedding vector for the given text.
     * @returns Array of numbers (e.g. 1536 dims for text-embedding-3-small)
     */
    /**
     * Embeds many texts with as few API calls as possible (100 inputs per request).
     * Results are in input order.
     */
    async embedMany(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        for (let i = 0; i < texts.length; i += 100) {
            const chunk = texts.slice(i, i + 100).map(t => t.trim().slice(0, 8191));
            const response = await this.client.embeddings.create({ model: this.model, input: chunk });
            const ordered = [...response.data].sort((a, b) => a.index - b.index);
            if (ordered.length !== chunk.length) {
                throw new Error('EmbeddingService.embedMany: unexpected number of embeddings in response');
            }
            results.push(...ordered.map(d => d.embedding));
        }
        return results;
    }

    async embed(text: string): Promise<number[]> {
        if (!text?.trim()) {
            throw new Error('EmbeddingService.embed: text is required');
        }
        const response = await this.client.embeddings.create({
            model: this.model,
            input: text.trim().slice(0, 8191), // model limit
        });
        const embedding = response.data[0]?.embedding;
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error('EmbeddingService.embed: no embedding in response');
        }
        return embedding;
    }
}
