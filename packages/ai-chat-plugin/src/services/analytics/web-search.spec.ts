import { describe, expect, it } from 'vitest';

import { citedSources, cleanUrl, resolveWebSearch } from './web-search';

describe('cleanUrl', () => {
    it("removes only OpenAI's tracking parameter", () => {
        expect(cleanUrl('https://a.example/p?utm_source=openai')).toBe('https://a.example/p');
        expect(cleanUrl('https://a.example/p?id=1&utm_source=openai')).toBe('https://a.example/p?id=1');
        expect(cleanUrl('https://a.example/p?utm_source=newsletter')).toBe('https://a.example/p?utm_source=newsletter');
        expect(cleanUrl('not a url')).toBe('not a url');
    });
});

describe('citedSources', () => {
    const sources = [{ url: 'https://a.example/x' }, { url: 'https://b.example/' }, { url: 'https://c.example/y' }];

    it('keeps the sources the text links to', () => {
        expect(citedSources('Price NPR 500 [A](https://a.example/x), also https://b.example', sources)).toEqual(sources.slice(0, 2));
    });

    it('keeps everything when the text cites nothing by URL', () => {
        expect(citedSources('No links here', sources)).toEqual(sources);
    });
});

describe('resolveWebSearch', () => {
    const azureOpenai = { apiKey: 'k', resourceName: 'r', deploymentName: 'd' };
    const custom = async () => ({ summary: '', sources: [] });

    it('prefers the webSearch option, then OpenAI, then Azure', () => {
        expect(resolveWebSearch({ webSearch: custom, openaiApiKey: 'k', azureOpenai }, 'm')).toBe(custom);
        expect(resolveWebSearch({ openaiApiKey: 'k', azureOpenai }, 'm')).toBeTypeOf('function');
        expect(resolveWebSearch({ azureOpenai }, 'm')).toBeTypeOf('function');
    });

    it('is off when disabled or when no provider can search', () => {
        expect(resolveWebSearch({ openaiApiKey: 'k', enableWebResearch: false }, 'm')).toBeUndefined();
        expect(resolveWebSearch({ embedTexts: async () => [] }, 'm')).toBeUndefined();
    });
});
