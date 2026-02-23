import {NextRequest, NextResponse} from 'next/server';
import {getAuthToken} from '@/lib/auth';

const VENDURE_API_URL = process.env.VENDURE_SHOP_API_URL || process.env.NEXT_PUBLIC_VENDURE_SHOP_API_URL;

function getVendureBase(): string {
    if (!VENDURE_API_URL) return '';
    return VENDURE_API_URL.replace(/\/shop-api\/?$/, '');
}


function getTextFromMessage(msg: Record<string, unknown>): string {
    if (Array.isArray(msg.parts)) {
        return (msg.parts as Array<Record<string, unknown>>)
            .filter(p => p.type === 'text' && typeof p.text === 'string')
            .map(p => p.text as string)
            .join('');
    }
    if (typeof msg.content === 'string') {
        return msg.content;
    }
    return '';
}


function getAssistantContentWithToolContext(msg: Record<string, unknown>): string {
    if (!Array.isArray(msg.parts)) {
        return typeof msg.content === 'string' ? msg.content : '';
    }

    const parts: string[] = [];

    for (const p of msg.parts as Array<Record<string, unknown>>) {
        if (p.type === 'text' && typeof p.text === 'string') {
            parts.push(p.text);
        }
        if (typeof p.type === 'string' && p.state === 'output-available' && p.output) {
            const output = p.output as Record<string, unknown>;
            if (typeof output.summary === 'string') {
                parts.push(`[Tool result: ${output.summary}]`);
            }
        }
    }

    return parts.join('\n');
}


export async function POST(request: NextRequest) {
    const base = getVendureBase();
    if (!base) {
        return NextResponse.json(
            {message: 'AI assistant is not configured.', products: [], collections: []},
            {status: 503}
        );
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {message: 'Invalid JSON body.', products: [], collections: []},
            {status: 400}
        );
    }

    console.log('[ai-assistant route] Received body keys:', Object.keys(body));

    let message = '';
    let history: Array<{ role: string; content: string }> = [];

    if (body.messages && Array.isArray(body.messages)) {
  
        const msgs = body.messages as Array<Record<string, unknown>>;

        console.log('[ai-assistant route] Messages count:', msgs.length);
        if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            console.log('[ai-assistant route] Last msg role:', last?.role, 'parts:', JSON.stringify((last as Record<string, unknown>)?.parts)?.slice(0, 200));
        }

        const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');
        message = lastUserMsg ? getTextFromMessage(lastUserMsg).trim() : '';

        const lastUserIndex = msgs.lastIndexOf(lastUserMsg!);
        const historyMsgs = lastUserIndex > 0 ? msgs.slice(0, lastUserIndex) : [];
        history = historyMsgs
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
                role: String(m.role),
                content: m.role === 'assistant'
                    ? getAssistantContentWithToolContext(m)
                    : getTextFromMessage(m),
            }))
            .filter(m => m.content.length > 0);
    } else if (typeof body.message === 'string') {
        message = body.message.trim();
        history = Array.isArray(body.history)
            ? (body.history as Array<{ role: string; content: string }>)
            : [];
    }

    console.log('[ai-assistant route] Extracted message:', JSON.stringify(message).slice(0, 200));

    if (!message) {
        return NextResponse.json(
            {message: 'Send a message to get started.', products: [], collections: []},
            {status: 400}
        );
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    const authToken = await getAuthToken();
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const url = `${base}/ai-assistant/stream`;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({message, history}),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error('[ai-assistant proxy] backend error:', res.status, text);
        return NextResponse.json(
            {message: 'AI assistant request failed.', products: [], collections: []},
            {status: 502}
        );
    }

    const responseHeaders = new Headers();
    res.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'content-type' || key.toLowerCase().startsWith('x-')) {
            responseHeaders.set(key, value);
        }
    });

    return new Response(res.body, {
        status: res.status,
        headers: responseHeaders,
    });
}
