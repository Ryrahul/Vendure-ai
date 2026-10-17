// ─── Types (mirror backend response) ────────────────────────────────

export interface Product {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
    variantId: string;
}

export interface Collection {
    id: string;
    name: string;
    slug: string;
}

export interface OrderLine {
    productName: string;
    quantity: number;
    image: string | null;
    linePriceWithTax: number;
}

export interface Order {
    id: string;
    code: string;
    state: string;
    total: number;
    orderPlacedAt: string | null;
    lines: OrderLine[];
    fulfillments: Array<{
        state: string;
        method: string;
        trackingCode: string | null;
    }>;
}

/** A destructive action the assistant requested; it only runs when the admin presses Confirm. */
export interface PendingConfirmation {
    id: string;
    toolName: string;
    description: string;
    status?: 'pending' | 'working' | 'confirmed' | 'cancelled' | 'failed';
    /** Outcome reported by the server after Confirm / Cancel. */
    result?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    products?: Product[];
    collections?: Collection[];
    orders?: Order[];
    pendingConfirmations?: PendingConfirmation[];
}
