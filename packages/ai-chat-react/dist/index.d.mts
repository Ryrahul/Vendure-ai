import * as react_jsx_runtime from 'react/jsx-runtime';
import { UIMessage } from 'ai';
import { ClassValue } from 'clsx';

/** A product returned from the AI chat tool results */
interface ChatProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
    variantId: string;
}
/** A collection returned from the AI chat tool results */
interface ChatCollection {
    id: string;
    name: string;
    slug: string;
}
/** Action signal to add an item to cart */
interface AddToCartAction {
    variantId: string;
    quantity: number;
    productName?: string;
}
/** A single line item in the active cart */
interface ChatCartLine {
    orderLineId: string;
    productName: string;
    variantId: string;
    quantity: number;
    linePriceWithTax: number;
}
/** The active order (cart) summary */
interface ChatActiveOrder {
    id: string;
    code: string;
    totalQuantity: number;
    totalWithTax: number;
    lines: ChatCartLine[];
}
/** Extracted structured data from an assistant message */
interface ExtractedData {
    products: ChatProduct[];
    collections: ChatCollection[];
    addToCartAction?: AddToCartAction;
    activeOrder?: ChatActiveOrder;
}
/** Props for the main VendureAiChat component */
interface VendureAiChatProps {
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
    /** Called when a product should be added to cart */
    onAddToCart?: (variantId: string, quantity: number, productName: string) => void | Promise<void>;
    /** Called when the AI modifies cart state (add, adjust quantity, checkout actions) */
    onCartUpdate?: (order: ChatActiveOrder) => void;
    /** Called when user clicks a link (product, collection) */
    onNavigate?: (path: string) => void;
    /** Custom renderer for product cards */
    renderProduct?: (product: ChatProduct) => React.ReactNode;
    /** Custom renderer for collection badges */
    renderCollection?: (collection: ChatCollection) => React.ReactNode;
    /** Custom renderer for cart summary */
    renderCartSummary?: (order: ChatActiveOrder) => React.ReactNode;
    /** Additional CSS class name */
    className?: string;
    /**
     * Format a price value (in smallest currency unit) for display.
     * Default: (price) => `$${(price / 100).toFixed(2)}`
     */
    formatPrice?: (price: number) => string;
}
/** Options for the useVendureChat hook */
interface UseVendureChatOptions {
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

/**
 * Drop-in AI shopping assistant chat component for Vendure stores.
 *
 * Uses Tailwind CSS for styling. Works with any React framework
 * (Next.js, Remix, Vite, CRA, etc.).
 */
declare function VendureAiChat({ vendureUrl, authToken, chatEndpoint, position, title, placeholder, welcomeMessage, quickActions, onAddToCart, onCartUpdate, onNavigate, renderProduct, renderCollection, renderCartSummary, className, formatPrice, }: VendureAiChatProps): react_jsx_runtime.JSX.Element;

interface UseVendureChatReturn {
    /** All chat messages */
    messages: UIMessage[];
    /** Current chat status */
    status: 'ready' | 'streaming' | 'submitted' | 'error';
    /** Send a text message */
    sendMessage: (text: string) => Promise<void>;
    /** Whether the chat is currently loading/streaming */
    isLoading: boolean;
    /** Get text content from a message */
    getMessageText: (msg: UIMessage) => string;
    /** Get extracted structured data from a message */
    getMessageData: (msg: UIMessage) => ExtractedData;
    /** Products from the latest assistant response */
    products: ChatProduct[];
    /** Collections from the latest assistant response */
    collections: ChatCollection[];
    /** Active order from the latest assistant response */
    activeOrder: ChatActiveOrder | undefined;
}
/**
 * Headless hook for Vendure AI chat.
 * Provides full control over the chat UI while handling transport and data extraction.
 */
declare function useVendureChat(options: UseVendureChatOptions): UseVendureChatReturn;

interface ChatMessageProps {
    message: UIMessage;
    onAddToCart?: VendureAiChatProps['onAddToCart'];
    onNavigate?: VendureAiChatProps['onNavigate'];
    renderProduct?: VendureAiChatProps['renderProduct'];
    renderCollection?: VendureAiChatProps['renderCollection'];
    renderCartSummary?: VendureAiChatProps['renderCartSummary'];
    formatPrice: (price: number) => string;
    addingToCart: string | null;
    onAddToCartClick: (variantId: string, productName: string, quantity?: number) => void;
}
declare function ChatMessage({ message, onNavigate, renderProduct, renderCollection, renderCartSummary, formatPrice, addingToCart, onAddToCartClick, }: ChatMessageProps): react_jsx_runtime.JSX.Element | null;

interface ProductCardProps {
    product: ChatProduct;
    onNavigate?: (path: string) => void;
    formatPrice: (price: number) => string;
    addingToCart: boolean;
    onAddToCart: () => void;
    className?: string;
}
declare function ProductCard({ product, onNavigate, formatPrice, addingToCart, onAddToCart, className }: ProductCardProps): react_jsx_runtime.JSX.Element;

interface CollectionBadgeProps {
    collection: ChatCollection;
    onNavigate?: (path: string) => void;
    className?: string;
}
declare function CollectionBadge({ collection, onNavigate, className }: CollectionBadgeProps): react_jsx_runtime.JSX.Element;

interface CartSummaryProps {
    order: ChatActiveOrder;
    formatPrice: (price: number) => string;
    className?: string;
}
declare function CartSummary({ order, formatPrice, className }: CartSummaryProps): react_jsx_runtime.JSX.Element;

/** Extract structured data (products, collections, cart actions) from a UIMessage's tool parts */
declare function extractDataFromMessage(message: UIMessage): ExtractedData;
/** Get the text content from message parts */
declare function getMessageText(message: UIMessage): string;

declare function cn(...inputs: ClassValue[]): string;

export { type AddToCartAction, CartSummary, type ChatActiveOrder, type ChatCartLine, type ChatCollection, ChatMessage, type ChatProduct, CollectionBadge, type ExtractedData, ProductCard, type UseVendureChatOptions, type UseVendureChatReturn, VendureAiChat, type VendureAiChatProps, cn, extractDataFromMessage, getMessageText, useVendureChat };
