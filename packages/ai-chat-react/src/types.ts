/** A product returned from the AI chat tool results */
export interface ChatProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
    variantId: string;
}

/** A collection returned from the AI chat tool results */
export interface ChatCollection {
    id: string;
    name: string;
    slug: string;
}

/** Action signal to add an item to cart */
export interface AddToCartAction {
    variantId: string;
    quantity: number;
    productName?: string;
}

/** A single line item in the active cart */
export interface ChatCartLine {
    orderLineId: string;
    productName: string;
    variantId: string;
    quantity: number;
    linePriceWithTax: number;
}

/** The active order (cart) summary */
export interface ChatActiveOrder {
    id: string;
    code: string;
    totalQuantity: number;
    totalWithTax: number;
    lines: ChatCartLine[];
}

/** Extracted structured data from an assistant message */
export interface ExtractedData {
    products: ChatProduct[];
    collections: ChatCollection[];
    addToCartAction?: AddToCartAction;
    activeOrder?: ChatActiveOrder;
}

/** Props for the main VendureAiChat component */
export interface VendureAiChatProps {
    /** The Vendure server URL (e.g. "https://my-vendure.com") */
    vendureUrl: string;
    /** Auth token for logged-in user features (cart, orders) */
    authToken?: string;
    /**
     * Override the chat API endpoint URL.
     * Useful when using a server-side proxy route (e.g. `/api/ai-assistant/chat`).
     * When set, `vendureUrl` is ignored for the chat transport.
     */
    chatEndpoint?: string;

    // Appearance
    /** Position of the chat button. Defaults to "bottom-right" */
    position?: 'bottom-right' | 'bottom-left' | 'inline';
    /** Title shown in the chat panel header */
    title?: string;
    /** Placeholder text for the input */
    placeholder?: string;
    /** Welcome message shown before any conversation */
    welcomeMessage?: string;
    /** Quick action buttons shown in the empty state */
    quickActions?: string[];

    // Callbacks
    /** Called when a product should be added to cart */
    onAddToCart?: (variantId: string, quantity: number, productName: string) => void | Promise<void>;
    /** Called when the AI modifies cart state (add, adjust quantity, checkout actions) */
    onCartUpdate?: (order: ChatActiveOrder) => void;
    /** Called when user clicks a link (product, collection) */
    onNavigate?: (path: string) => void;

    // Custom rendering
    /** Custom renderer for product cards */
    renderProduct?: (product: ChatProduct) => React.ReactNode;
    /** Custom renderer for collection badges */
    renderCollection?: (collection: ChatCollection) => React.ReactNode;
    /** Custom renderer for cart summary */
    renderCartSummary?: (order: ChatActiveOrder) => React.ReactNode;

    // Styling
    /** Additional CSS class name */
    className?: string;

    /**
     * Format a price value (in smallest currency unit) for display.
     * Default: (price) => `$${(price / 100).toFixed(2)}`
     */
    formatPrice?: (price: number) => string;
}

/** Options for the useVendureChat hook */
export interface UseVendureChatOptions {
    /** The Vendure server URL (e.g. "https://my-vendure.com") */
    vendureUrl: string;
    /** Auth token for logged-in user features */
    authToken?: string;
    /**
     * Override the chat API endpoint URL.
     * Useful when using a server-side proxy route (e.g. `/api/ai-assistant/chat`).
     * When set, `vendureUrl` is ignored for the chat transport.
     */
    chatEndpoint?: string;
}
