import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';

import { EMBEDDING_DIMENSIONS, type AiAssistantPluginOptions } from '../constants';

export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

type AzureOptions = NonNullable<AiAssistantPluginOptions['azureOpenai']>;
type CompatibleOptions = NonNullable<AiAssistantPluginOptions['openaiCompatible']>;

export interface ChatModels {
    primary: LanguageModel;
    /** Azure OpenAI, when configured next to another primary model. */
    fallback?: LanguageModel;
    /** Name recorded in chat history. */
    label: string;
}

/**
 * Picks the chat model(s) from the plugin options, in this order:
 * 1. `chatModel` as an AI SDK model instance (any provider);
 * 2. `openaiCompatible.chatModel` (self-hosted / OpenAI-compatible API);
 * 3. `chatModel` as an OpenAI model name, with `openaiApiKey`;
 * 4. `azureOpenai`.
 * When `azureOpenai` is configured next to another primary model, it is the fallback.
 */
export function resolveChatModels(options: AiAssistantPluginOptions): ChatModels {
    const azure = options.azureOpenai ? createAzureProvider(options.azureOpenai)(options.azureOpenai.deploymentName) : undefined;
    if (options.chatModel && typeof options.chatModel !== 'string') {
        return { primary: options.chatModel, fallback: azure, label: modelLabel(options.chatModel) };
    }
    const compatible = options.openaiCompatible;
    if (compatible?.chatModel) {
        // Chat Completions: the API that OpenAI-compatible servers implement.
        return { primary: createCompatibleProvider(compatible).chat(compatible.chatModel), fallback: azure, label: `${compatibleName(compatible)}:${compatible.chatModel}` };
    }
    if (options.openaiApiKey) {
        const name = typeof options.chatModel === 'string' ? options.chatModel : DEFAULT_CHAT_MODEL;
        return { primary: createOpenAI({ apiKey: options.openaiApiKey })(name), fallback: azure, label: name };
    }
    if (azure && options.azureOpenai) {
        return { primary: azure, label: options.azureOpenai.deploymentName };
    }
    throw new Error(
        'AiAssistantPlugin: configure a chat model — openaiApiKey, azureOpenai, openaiCompatible.chatModel, or chatModel (an AI SDK model instance).',
    );
}

/**
 * Runs `run` with the primary model and, if that throws and a fallback is configured,
 * once more with the fallback.
 */
export async function withFallback<T>(
    models: ChatModels,
    logger: { error(message: string): void },
    run: (model: LanguageModel) => Promise<T>,
): Promise<T> {
    try {
        return await run(models.primary);
    } catch (primaryError) {
        if (!models.fallback) throw primaryError;
        logger.error(`Primary chat model failed, falling back to Azure OpenAI: ${primaryError}`);
        return run(models.fallback);
    }
}

export interface ResolvedEmbedding {
    /** The AI SDK embedding model, or null when the `embedTexts` function is used. */
    model: EmbeddingModel | null;
    /** Identifies model + size; part of each text's content hash, so a change re-embeds everything. */
    label: string;
    dimensions: number;
}

/**
 * Picks the embedding source from the plugin options, in this order:
 * 1. the `embedTexts` function;
 * 2. `embeddingModel` as an AI SDK embedding model instance;
 * 3. `openaiCompatible.embeddingModel`;
 * 4. `azureOpenai.embeddingDeploymentName`;
 * 5. `embeddingModel` as an OpenAI model name, with `openaiApiKey`.
 */
export function resolveEmbedding(options: AiAssistantPluginOptions): ResolvedEmbedding {
    const dimensions = resolveEmbeddingDimensions(options);
    if (options.embedTexts) {
        return { model: null, label: `custom:${dimensions}`, dimensions };
    }
    if (options.embeddingModel && typeof options.embeddingModel !== 'string') {
        return { model: options.embeddingModel, label: `${modelLabel(options.embeddingModel)}:${dimensions}`, dimensions };
    }
    const compatible = options.openaiCompatible;
    if (compatible?.embeddingModel) {
        return {
            model: createCompatibleProvider(compatible).textEmbeddingModel(compatible.embeddingModel),
            label: `${compatibleName(compatible)}:${compatible.embeddingModel}:${dimensions}`,
            dimensions,
        };
    }
    const azure = options.azureOpenai;
    if (azure?.embeddingDeploymentName) {
        const embedding = definedOnly(azure.embedding ?? {});
        // A separate embedding resource replaces the chat resource's location entirely.
        const location = embedding.baseURL || embedding.resourceName ? { baseURL: embedding.baseURL, resourceName: embedding.resourceName } : {};
        const provider = createAzureProvider({ ...azure, ...embedding, ...location });
        return { model: provider.textEmbeddingModel(azure.embeddingDeploymentName), label: `azure:${azure.embeddingDeploymentName}:${dimensions}`, dimensions };
    }
    if (options.openaiApiKey) {
        const name = typeof options.embeddingModel === 'string' ? options.embeddingModel : DEFAULT_EMBEDDING_MODEL;
        // The bare model name, as before 0.5, so existing content hashes stay valid.
        return { model: createOpenAI({ apiKey: options.openaiApiKey }).textEmbeddingModel(name), label: name, dimensions };
    }
    throw new Error(
        'AiAssistantPlugin: embeddings need openaiApiKey, azureOpenai.embeddingDeploymentName, openaiCompatible.embeddingModel, an embeddingModel instance or an embedTexts function.',
    );
}

/** The embedding model from the options, or null when `embedTexts` is used instead. */
export function resolveEmbeddingModel(options: AiAssistantPluginOptions): EmbeddingModel | null {
    return resolveEmbedding(options).model;
}

/** `embeddingDimensions`, else `openaiCompatible.embeddingDimensions`, else 1536. */
export function resolveEmbeddingDimensions(options: AiAssistantPluginOptions): number {
    return options.embeddingDimensions ?? options.openaiCompatible?.embeddingDimensions ?? EMBEDDING_DIMENSIONS;
}

function createAzureProvider(config: Pick<AzureOptions, 'apiKey' | 'resourceName' | 'baseURL' | 'apiVersion'>) {
    return createAzure({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : { resourceName: config.resourceName }),
        ...(config.apiVersion ? { apiVersion: config.apiVersion } : {}),
    });
}

function createCompatibleProvider(config: CompatibleOptions) {
    return createOpenAI({
        baseURL: config.baseURL.replace(/\/+$/, ''),
        // Local servers ignore the key; the client requires one.
        apiKey: config.apiKey || 'not-needed',
        name: compatibleName(config),
        ...(config.headers ? { headers: config.headers } : {}),
    });
}

function compatibleName(config: CompatibleOptions): string {
    return config.name || 'openai-compatible';
}

function definedOnly<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}

/** A readable name for an AI SDK model instance, e.g. "anthropic.messages:claude-sonnet-5-5". */
export function modelLabel(model: LanguageModel | EmbeddingModel): string {
    if (typeof model === 'string') return model;
    return `${(model as any).provider ?? 'custom'}:${(model as any).modelId ?? 'model'}`;
}
