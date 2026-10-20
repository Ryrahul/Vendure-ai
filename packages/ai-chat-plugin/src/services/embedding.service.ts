import { Inject, Injectable } from '@nestjs/common';
import { embedMany, type EmbeddingModel } from 'ai';
import { AI_ASSISTANT_OPTIONS } from '../constants';
import type { AiAssistantPluginOptions } from '../constants';
import { resolveEmbedding } from './model-provider';

/** @deprecated Configure embeddings through the plugin options instead. */
export interface EmbeddingOptions {
    openaiApiKey: string;
    /** Model name, e.g. 'text-embedding-3-small' (default) or 'text-embedding-3-large' */
    model?: string;
}

/** Characters kept per text (text-embedding-3 accepts 8191 tokens; this stays well inside). */
const MAX_TEXT_LENGTH = 8191;

/**
 * Generates text embeddings for semantic search, with the configured embedding model
 * (OpenAI by default, any AI SDK embedding model) or the `embedTexts` function.
 */
@Injectable()
export class EmbeddingService {
    private embeddingModel: EmbeddingModel | null;
    private customEmbed: ((texts: string[]) => Promise<number[][]>) | undefined;
    readonly dimensions: number;
    /** Identifies the model; part of each text's content hash, so changing it re-embeds everything. */
    readonly model: string;

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) options: AiAssistantPluginOptions,
    ) {
        const resolved = resolveEmbedding(options);
        this.customEmbed = options.embedTexts;
        this.embeddingModel = resolved.model;
        this.dimensions = resolved.dimensions;
        this.model = resolved.label;
    }

    /**
     * Embeds many texts with as few API calls as possible. Results are in input order.
     */
    async embedMany(texts: string[]): Promise<number[][]> {
        if (!texts.length) return [];
        const values = texts.map(t => t.trim().slice(0, MAX_TEXT_LENGTH));
        const vectors = this.customEmbed
            ? await this.customEmbed(values)
            : (await embedMany({ model: this.embeddingModel!, values, maxParallelCalls: 2 })).embeddings;
        if (!Array.isArray(vectors) || vectors.length !== values.length) {
            throw new Error('EmbeddingService.embedMany: unexpected number of embeddings in response');
        }
        for (const vector of vectors) {
            if (!Array.isArray(vector) || vector.length !== this.dimensions) {
                throw new Error(
                    `EmbeddingService: the embedding model returned ${Array.isArray(vector) ? vector.length : 'no'} dimensions, ` +
                        `but embeddingDimensions is ${this.dimensions}. Set embeddingDimensions to match the model.`,
                );
            }
        }
        return vectors;
    }

    async embed(text: string): Promise<number[]> {
        if (!text?.trim()) {
            throw new Error('EmbeddingService.embed: text is required');
        }
        const [embedding] = await this.embedMany([text]);
        return embedding;
    }
}
