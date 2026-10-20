import { describe, expect, it } from 'vitest';

import { resolveChatModels, resolveEmbedding, resolveEmbeddingDimensions } from './model-provider';

/** The URL the AI SDK would call for this model. */
const urlOf = (model: any, path: string) => model.config.url({ path, modelId: model.modelId });

const azureOpenai = { apiKey: 'chat-key', resourceName: 'chat-res', deploymentName: 'gpt-4.1' };
const local = { baseURL: 'http://localhost:11434/v1/', chatModel: 'qwen3:14b', embeddingModel: 'nomic-embed-text', embeddingDimensions: 768, name: 'ollama' };

describe('chat model', () => {
    it('uses an OpenAI-compatible server from plain settings (Chat Completions)', () => {
        const { primary, label } = resolveChatModels({ openaiCompatible: local }) as any;
        expect(label).toBe('ollama:qwen3:14b');
        expect(primary.modelId).toBe('qwen3:14b');
        expect(urlOf(primary, '/chat/completions')).toBe('http://localhost:11434/v1/chat/completions');
    });

    it('prefers openaiCompatible over an OpenAI key, with Azure as the fallback', () => {
        const models = resolveChatModels({ openaiCompatible: local, openaiApiKey: 'sk', azureOpenai });
        expect(models.label).toBe('ollama:qwen3:14b');
        expect((models.fallback as any).modelId).toBe('gpt-4.1');
    });

    it('uses Azure alone without other providers', () => {
        expect(resolveChatModels({ azureOpenai }).label).toBe('gpt-4.1');
    });
});

describe('embeddings', () => {
    it('uses the Azure embedding deployment on the chat resource', () => {
        const e = resolveEmbedding({ azureOpenai: { ...azureOpenai, embeddingDeploymentName: 'text-embedding-3-small' } }) as any;
        expect(e.label).toBe('azure:text-embedding-3-small:1536');
        expect(urlOf(e.model, '/embeddings')).toMatch(/^https:\/\/chat-res\.openai\.azure\.com\//);
    });

    it('uses a separate Azure embedding resource and key when given', () => {
        const e = resolveEmbedding({
            azureOpenai: { ...azureOpenai, embeddingDeploymentName: 'emb', embedding: { apiKey: 'emb-key', resourceName: 'emb-res' } },
        }) as any;
        expect(urlOf(e.model, '/embeddings')).toMatch(/^https:\/\/emb-res\.openai\.azure\.com\//);
    });

    it('a separate embedding resource replaces a chat baseURL', () => {
        const e = resolveEmbedding({
            azureOpenai: { apiKey: 'k', baseURL: 'https://chat.services.ai.azure.com/openai', deploymentName: 'gpt', embeddingDeploymentName: 'emb', embedding: { resourceName: 'emb-res' } },
        }) as any;
        expect(urlOf(e.model, '/embeddings')).toMatch(/^https:\/\/emb-res\.openai\.azure\.com\//);
    });

    it('uses the OpenAI-compatible embedding model and its size', () => {
        const e = resolveEmbedding({ openaiCompatible: local }) as any;
        expect(e.label).toBe('ollama:nomic-embed-text:768');
        expect(e.dimensions).toBe(768);
        expect(urlOf(e.model, '/embeddings')).toBe('http://localhost:11434/v1/embeddings');
        expect(resolveEmbeddingDimensions({ openaiCompatible: local })).toBe(768);
    });

    it('keeps the bare model name as the label for plain OpenAI (existing hashes stay valid)', () => {
        expect(resolveEmbedding({ openaiApiKey: 'sk' }).label).toBe('text-embedding-3-small');
        expect(resolveEmbedding({ openaiApiKey: 'sk', embeddingModel: 'text-embedding-3-large', embeddingDimensions: 3072 }).label).toBe('text-embedding-3-large');
    });

    it('order: embedTexts, model instance, openaiCompatible, Azure deployment, OpenAI', () => {
        const embedTexts = async () => [];
        expect(resolveEmbedding({ embedTexts, openaiCompatible: local, openaiApiKey: 'sk' }).label).toBe('custom:768');
        expect(resolveEmbedding({ openaiCompatible: local, azureOpenai: { ...azureOpenai, embeddingDeploymentName: 'e' }, openaiApiKey: 'sk' }).label).toBe('ollama:nomic-embed-text:768');
        expect(resolveEmbedding({ azureOpenai: { ...azureOpenai, embeddingDeploymentName: 'e' }, openaiApiKey: 'sk' }).label).toBe('azure:e:1536');
    });

    it('explains what is missing', () => {
        expect(() => resolveEmbedding({ azureOpenai })).toThrow(/azureOpenai\.embeddingDeploymentName/);
        expect(() => resolveEmbedding({ openaiCompatible: { baseURL: 'http://x/v1', chatModel: 'm' } })).toThrow(/openaiCompatible\.embeddingModel/);
    });
});
