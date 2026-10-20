import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';

import type { AiAssistantPluginOptions } from '../../constants';

export interface WebSearchSource {
    title: string;
    url: string;
}

export interface WebSearchResult {
    /** Findings as plain text: sellers, products, prices and where each came from. */
    summary: string;
    sources: WebSearchSource[];
}

/** The store's location from its profile, to localize results. All fields optional. */
export interface WebSearchLocation {
    city?: string;
    region?: string;
    countryCode?: string;
}

/**
 * Searches the web for the admin assistant's market and competitor research.
 * Supply your own (Tavily, Brave, SerpAPI, …) via the plugin's `webSearch` option.
 */
export type WebSearchFunction = (query: string, location: WebSearchLocation) => Promise<WebSearchResult>;

/** Upper limit for one web search; the assistant carries on without it when exceeded. */
export const WEB_SEARCH_TIMEOUT_MS = 45_000;

/** Runs a search with the time limit, for built-in and custom search functions alike. */
export async function searchWithTimeout(search: WebSearchFunction, query: string, location: WebSearchLocation, timeoutMs = WEB_SEARCH_TIMEOUT_MS) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no results within ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
    });
    try {
        return await Promise.race([search(query, location), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

const RESEARCH_INSTRUCTIONS =
    'You are a web research assistant for an online store. Search the web for the query and report the relevant ' +
    'findings concisely: seller or store names, product names, prices with currency, and the page URL of each finding. ' +
    'Report only what the search results say. If nothing relevant is found, say so. Do not give advice.';

/** Default search: one OpenAI Responses call with its built-in web search tool. */
export function openAiWebSearch(apiKey: string, model: string): WebSearchFunction {
    const openai = createOpenAI({ apiKey });
    return hostedWebSearch(openai.responses(model), location => openai.tools.webSearch({ searchContextSize: 'medium', ...userLocation(location) }));
}

/** Default search on Azure OpenAI: the deployment's built-in web search (Responses API). */
export function azureWebSearch(config: NonNullable<AiAssistantPluginOptions['azureOpenai']>): WebSearchFunction {
    const azure = createAzure({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : { resourceName: config.resourceName }),
        ...(config.apiVersion ? { apiVersion: config.apiVersion } : {}),
    });
    return hostedWebSearch(azure.responses(config.deploymentName), location =>
        azure.tools.webSearchPreview({ searchContextSize: 'medium', ...userLocation(location) }),
    );
}

function hostedWebSearch(model: LanguageModel, searchTool: (location: WebSearchLocation) => unknown): WebSearchFunction {
    return async (query, location) => {
        const result = await generateText({
            model,
            system: RESEARCH_INSTRUCTIONS,
            prompt: query,
            // Provider-defined tool types don't fit generateText's ToolSet generics in ai@6.
            tools: { web_search: searchTool(location) as any },
            toolChoice: { type: 'tool', toolName: 'web_search' },
            // A stuck search must not hold up the whole answer (see WEB_SEARCH_TIMEOUT_MS).
            abortSignal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
            maxRetries: 1,
        });
        const sources = new Map<string, WebSearchSource>();
        for (const source of result.sources) {
            if (source.sourceType === 'url') {
                const url = cleanUrl(source.url);
                sources.set(url, { title: source.title || url, url });
            }
        }
        const summary = result.text.replace(/\?utm_source=openai&/g, '?').replace(/[?&]utm_source=openai\b/g, '');
        return { summary, sources: citedSources(summary, [...sources.values()]) };
    };
}

function userLocation(location: WebSearchLocation) {
    if (!location.city && !location.region && !location.countryCode) return {};
    return {
        userLocation: {
            type: 'approximate' as const,
            ...(location.city ? { city: location.city } : {}),
            ...(location.region ? { region: location.region } : {}),
            ...(location.countryCode ? { country: location.countryCode } : {}),
        },
    };
}

/**
 * The web search to use: the plugin's `webSearch` option, else OpenAI's built-in search
 * (with `openaiApiKey`), else Azure's (with `azureOpenai`); none when research is off.
 */
export function resolveWebSearch(options: AiAssistantPluginOptions, defaultChatModel: string): WebSearchFunction | undefined {
    if (options.enableWebResearch === false) return undefined;
    if (options.webSearch) return options.webSearch;
    if (options.openaiApiKey) return openAiWebSearch(options.openaiApiKey, typeof options.chatModel === 'string' ? options.chatModel : defaultChatModel);
    if (options.azureOpenai) return azureWebSearch(options.azureOpenai);
    return undefined;
}

/** Removes the tracking parameter OpenAI adds to cited links. */
export function cleanUrl(raw: string): string {
    try {
        const url = new URL(raw);
        if (url.searchParams.get('utm_source') === 'openai') url.searchParams.delete('utm_source');
        return url.toString();
    } catch {
        return raw;
    }
}

/**
 * The sources the text actually cites (searches consult many pages); all of them when the
 * text cites none by URL.
 */
export function citedSources<T extends { url: string }>(text: string, sources: T[]): T[] {
    const cited = sources.filter(s => text.includes(s.url) || text.includes(s.url.replace(/\/$/, '')));
    return cited.length ? cited : sources;
}
