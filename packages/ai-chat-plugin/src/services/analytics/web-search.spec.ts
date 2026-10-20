import { describe, expect, it } from 'vitest';

import { citedSources, cleanUrl } from './web-search';

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
