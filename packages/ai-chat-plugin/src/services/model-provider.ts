import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';

import type { AiAssistantPluginOptions } from '../constants';

export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

export interface ChatModels {
    primary: LanguageModel;
    /** Azure OpenAI, when configured next to another primary model. */
    fallback?: LanguageModel;
    /** Name recorded in chat history. */
    label: string;
}

/**
 * Picks the chat model(s) from the plugin options:
 * - `chatModel` as an AI SDK model instance (any provider) is used as is;
 * - otherwise `chatModel` names an OpenAI model, used with `openaiApiKey`;
 * - without `openaiApiKey`, `azureOpenai` is the primary model.
 * When `azureOpenai` is configured next to another primary model, it is the fallback.
 */
export function resolveChatModels(options: AiAssistantPluginOptions): ChatModels {
    const azure = options.azureOpenai ? createAzureModel(options.azureOpenai) : undefined;
    if (options.chatModel && typeof options.chatModel !== 'string') {
        return { primary: options.chatModel, fallback: azure, label: modelLabel(options.chatModel) };
    }
    if (options.openaiApiKey) {
        const name = options.chatModel ?? DEFAULT_CHAT_MODEL;
        return { primary: createOpenAI({ apiKey: options.openaiApiKey })(name), fallback: azure, label: name };
    }
    if (azure && options.azureOpenai) {
        return { primary: azure, label: options.azureOpenai.deploymentName };
    }
    throw new Error('AiAssistantPlugin: configure a chat model — openaiApiKey, azureOpenai, or chatModel (an AI SDK model instance).');
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

/** The embedding model from the options, or null when `embedTexts` is used instead. */
export function resolveEmbeddingModel(options: AiAssistantPluginOptions): EmbeddingModel | null {
    if (options.embedTexts) return null;
    const model = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    if (typeof model !== 'string') return model;
    if (!options.openaiApiKey) {
        throw new Error(
            'AiAssistantPlugin: embeddings need openaiApiKey, an embeddingModel instance (e.g. azure.textEmbeddingModel(...)) or an embedTexts function.',
        );
    }
    return createOpenAI({ apiKey: options.openaiApiKey }).textEmbeddingModel(model);
}

function createAzureModel(config: NonNullable<AiAssistantPluginOptions['azureOpenai']>): LanguageModel {
    const azure = createAzure({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : { resourceName: config.resourceName }),
        ...(config.apiVersion ? { apiVersion: config.apiVersion } : {}),
    });
    return azure(config.deploymentName);
}

/** A readable name for an AI SDK model instance, e.g. "anthropic.messages:claude-sonnet-5-5". */
export function modelLabel(model: LanguageModel | EmbeddingModel): string {
    if (typeof model === 'string') return model;
    return `${(model as any).provider ?? 'custom'}:${(model as any).modelId ?? 'model'}`;
}
