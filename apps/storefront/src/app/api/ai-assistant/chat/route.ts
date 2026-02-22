import {NextRequest, NextResponse} from 'next/server';
import {getAuthToken} from '@/lib/auth';

const VENDURE_API_URL = process.env.VENDURE_SHOP_API_URL || process.env.NEXT_PUBLIC_VENDURE_SHOP_API_URL;

function getVendureBase(): string {
    if (!VENDURE_API_URL) return '';
    return VENDURE_API_URL.replace(/\/shop-api\/?$/, '');
}

export async function POST(request: NextRequest) {
    const base = getVendureBase();
    if (!base) {
        return NextResponse.json(
            {message: 'AI assistant is not configured.', products: [], collections: []},
            {status: 503}
        );
    }
    let body: { message?: string; history?: Array<{ role: string; content: string }> };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {message: 'Invalid JSON body.', products: [], collections: []},
            {status: 400}
        );
    }
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
        return NextResponse.json(
            {message: 'Send a message to get started.', products: [], collections: []},
            {status: 400}
        );
    }

    const history = Array.isArray(body?.history) ? body.history : [];

    // Build headers, forwarding the auth token if present
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    const authToken = await getAuthToken();
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const url = `${base}/ai-assistant/chat`;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, history }),
    });
    if (!res.ok) {
        const text = await res.text();
        console.error('[ai-assistant proxy] backend error:', res.status, text);
        return NextResponse.json(
            {message: 'AI assistant request failed.', products: [], collections: []},
            {status: 502}
        );
    }
    const data = (await res.json()) as {
        message: string;
        products?: Array<{ id: string; name: string; slug: string; price: number; image: string | null; variantId: string }>;
        collections?: Array<{ id: string; name: string; slug: string }>;
        addToCartAction?: { variantId: string; quantity: number; productName?: string };
        orders?: Array<{
            id: string;
            code: string;
            state: string;
            total: number;
            orderPlacedAt: string | null;
            lines: Array<{ productName: string; quantity: number }>;
            fulfillments: Array<{ state: string; method: string; trackingCode: string | null }>;
        }>;
    };
    const assetsBase = `${base}/assets/`;
    const products = (data.products || []).map((p) => ({
        ...p,
        image: p.image ? `${assetsBase}${p.image}` : null,
    }));
    return NextResponse.json({
        message: data.message,
        products,
        collections: data.collections || [],
        addToCartAction: data.addToCartAction || null,
        orders: data.orders || null,
    });
}
