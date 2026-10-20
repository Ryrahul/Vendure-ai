import { lookup as dnsLookup, LookupAddress } from 'dns';
import http from 'http';
import https from 'https';
import { isIP } from 'net';

import { stripHtml } from '../embedding-text';

export interface FetchedPage {
    url: string;
    title: string;
    text: string;
    truncated: boolean;
}

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;
const MAX_TEXT = 15_000;
const MAX_REDIRECTS = 3;

/**
 * Fetches a public web page as plain text for competitor/pricing research.
 *
 * Guarded against SSRF: only http(s) on ports 80/443, and the IP address is checked at
 * connect time (custom DNS lookup), so private, loopback, link-local (incl. cloud metadata)
 * and other non-public addresses are refused even via redirects or DNS rebinding.
 */
export async function fetchPublicPage(rawUrl: string): Promise<FetchedPage> {
    let url = parseUrl(rawUrl);
    for (let redirects = 0; ; redirects++) {
        const res = await request(url);
        if (res.status >= 300 && res.status < 400 && res.location) {
            if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects');
            url = parseUrl(new URL(res.location, url).toString());
            continue;
        }
        if (res.status >= 400) throw new Error(`The page returned HTTP ${res.status}`);
        const type = res.contentType.toLowerCase();
        if (!/text\/html|text\/plain|application\/xhtml|application\/json/.test(type)) {
            throw new Error(`Unsupported content type: ${type || 'unknown'}`);
        }
        const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(res.body)?.[1]?.trim() ?? '';
        const text = type.includes('html') ? stripHtml(res.body) : res.body.replace(/\s+/g, ' ').trim();
        return { url: url.toString(), title: stripHtml(title), text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT || res.truncated };
    }
}

function parseUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('Invalid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs are allowed');
    if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Only the standard ports 80 and 443 are allowed');
    if (url.username || url.password) throw new Error('URLs with credentials are not allowed');
    if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !isPublicIp(url.hostname.replace(/^\[|\]$/g, ''))) {
        throw new Error('That address is not a public internet address');
    }
    return url;
}

function request(url: URL): Promise<{ status: number; location?: string; contentType: string; body: string; truncated: boolean }> {
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const req = client.get(
            url,
            {
                timeout: TIMEOUT_MS,
                headers: { 'user-agent': 'Mozilla/5.0 (compatible; VendureAiAssistant/1.0)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
                lookup: safeLookup as any,
            },
            res => {
                const status = res.statusCode ?? 0;
                const location = res.headers.location;
                const contentType = String(res.headers['content-type'] ?? '');
                if (status >= 300 && status < 400) {
                    res.resume();
                    resolve({ status, location, contentType, body: '', truncated: false });
                    return;
                }
                const chunks: Buffer[] = [];
                let size = 0;
                let truncated = false;
                res.on('data', (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > MAX_BYTES) {
                        truncated = true;
                        res.destroy();
                        return;
                    }
                    chunks.push(chunk);
                });
                const done = () => resolve({ status, location, contentType, body: Buffer.concat(chunks).toString('utf8'), truncated });
                res.on('end', done);
                res.on('close', done);
                res.on('error', reject);
            },
        );
        req.on('timeout', () => req.destroy(new Error('The page took too long to respond')));
        req.on('error', reject);
    });
}

/** DNS lookup that refuses non-public addresses, checked for the address actually used. */
function safeLookup(hostname: string, options: any, callback: (err: Error | null, address?: any, family?: number) => void) {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
        if (err) return callback(err);
        const list = Array.isArray(addresses) ? addresses : [addresses as unknown as LookupAddress];
        const blocked = list.find(a => !isPublicIp(a.address));
        if (blocked || !list.length) {
            return callback(new Error('That host resolves to a non-public address'));
        }
        if (options?.all) return callback(null, list);
        callback(null, list[0].address, list[0].family);
    });
}

export function isPublicIp(ip: string): boolean {
    const v = isIP(ip);
    if (v === 4) {
        const [a, b] = ip.split('.').map(Number);
        if (a === 0 || a === 10 || a === 127) return false;
        if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
        if (a === 169 && b === 254) return false; // link-local incl. cloud metadata
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 192 && b === 168) return false;
        if (a === 192 && b === 0) return false;
        if (a === 198 && (b === 18 || b === 19)) return false;
        if (a >= 224) return false; // multicast & reserved
        return true;
    }
    if (v === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::' || lower === '::1') return false;
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
        if (mapped) return isPublicIp(mapped[1]);
        if (/^f[cd]/.test(lower)) return false; // unique local
        if (/^fe[89ab]/.test(lower)) return false; // link-local
        if (/^ff/.test(lower)) return false; // multicast
        return true;
    }
    return false;
}
