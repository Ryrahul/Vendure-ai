// Main component
export { VendureAiChat } from './components/VendureAiChat';

// Headless hook
export { useVendureChat } from './hooks/use-vendure-chat';
export type { UseVendureChatReturn } from './hooks/use-vendure-chat';

// Sub-components (for advanced customization)
export { ChatMessage } from './components/ChatMessage';
export { ProductCard } from './components/ProductCard';
export { CollectionBadge } from './components/CollectionBadge';
export { CartSummary } from './components/CartSummary';
export { OrderCard } from './components/OrderCard';

// Types
export type {
    VendureAiChatProps,
    UseVendureChatOptions,
    ChatProduct,
    ChatCollection,
    ChatOrder,
    ChatOrderLine,
    AddToCartAction,
    ChatCartLine,
    ChatActiveOrder,
    ExtractedData,
} from './types';

// Utilities
export { extractDataFromMessage, getMessageText } from './utils/extract-data';
export { cn } from './utils/cn';
