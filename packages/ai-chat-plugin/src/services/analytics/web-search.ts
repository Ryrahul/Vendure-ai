import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

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

const RESEARCH_INSTRUCTIONS =
    'You are a web research assistant for an online store. Search the web for the query and report the relevant ' +
    'findings concisely: seller or store names, product names, prices with currency, and the page URL of each finding. ' +
    'Report only what the search results say. If nothing relevant is found, say so. Do not give advice.';

/** Default search: one OpenAI Responses call with its built-in web search tool. */
export function openAiWebSearch(apiKey: string, model: string): WebSearchFunction {
    const openai = createOpenAI({ apiKey });
    return async (query, location) => {
        const userLocation =
            location.city || location.region || location.countryCode
                ? {
                      type: 'approximate' as const,
                      ...(location.city ? { city: location.city } : {}),
                      ...(location.region ? { region: location.region } : {}),
                      ...(location.countryCode ? { country: location.countryCode } : {}),
                  }
                : undefined;
        const result = await generateText({
            model: openai.responses(model),
            system: RESEARCH_INSTRUCTIONS,
            prompt: query,
            // Provider-defined tool types don't fit generateText's ToolSet generics in ai@6.
            tools: { web_search: openai.tools.webSearch({ searchContextSize: 'medium', ...(userLocation ? { userLocation } : {}) }) as any },
            toolChoice: { type: 'tool', toolName: 'web_search' },
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
