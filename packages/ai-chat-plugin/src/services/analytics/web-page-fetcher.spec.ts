import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchPublicPage, isPublicIp } from './web-page-fetcher';

describe('isPublicIp', () => {
    it.each([
        ['8.8.8.8', true],
        ['1.1.1.1', true],
        ['127.0.0.1', false],
        ['10.1.2.3', false],
        ['172.16.0.1', false],
        ['192.168.1.1', false],
        ['169.254.169.254', false], // cloud metadata
        ['100.64.0.1', false],
        ['0.0.0.0', false],
        ['::1', false],
        ['fd00::1', false],
        ['fe80::1', false],
        ['::ffff:127.0.0.1', false],
        ['2606:4700:4700::1111', true],
    ])('%s → %s', (ip, expected) => {
        expect(isPublicIp(ip)).toBe(expected);
    });
});

describe('fetchPublicPage refuses non-public targets', () => {
    let server: http.Server;
    let port: number;

    beforeAll(async () => {
        // A local "internal service" the assistant must never be able to read.
        server = http.createServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end('<title>secret</title>internal admin data');
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        port = (server.address() as AddressInfo).port;
    });

    afterAll(() => new Promise<void>(r => server.close(() => r())));

    it.each([
        ['http://127.0.0.1/', /not a public/],
        ['http://169.254.169.254/latest/meta-data/', /not a public/],
        ['http://localhost/', /non-public address/],
        ['file:///etc/passwd', /Only http and https/],
        ['ftp://example.com/', /Only http and https/],
        ['http://user:pass@example.com/', /credentials/],
        ['not a url', /Invalid URL/],
    ])('%s', async (url, error) => {
        await expect(fetchPublicPage(url)).rejects.toThrow(error);
    });

    it('refuses non-standard ports (where internal services live)', async () => {
        await expect(fetchPublicPage(`http://127.0.0.1:${port}/`)).rejects.toThrow(/standard ports/);
        await expect(fetchPublicPage(`http://localhost:${port}/`)).rejects.toThrow(/standard ports/);
    });
});

describe.skipIf(process.env.SKIP_NETWORK_TESTS)('fetchPublicPage on the public internet', () => {
    it('reads a public page as plain text', async () => {
        const page = await fetchPublicPage('https://example.com/');
        expect(page.title).toMatch(/Example Domain/);
        expect(page.text).toMatch(/This domain is for use in/);
        expect(page.text).not.toMatch(/<\w+/);
    });
});
