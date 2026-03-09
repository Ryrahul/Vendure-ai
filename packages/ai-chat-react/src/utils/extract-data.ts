import type { UIMessage } from 'ai';
import type { ChatProduct, ChatCollection, ChatOrder, ChatPromotion, AddToCartAction, ApplyCouponAction, ChatActiveOrder, ExtractedData } from '../types';

function extractToolOutput(p: Record<string, unknown>, data: ExtractedData) {
    const result = p.output as Record<string, unknown>;

    // Extract products (image URLs are already fully resolved by the backend)
    if (Array.isArray(result.products)) {
        for (const prod of result.products) {
            const product = prod as ChatProduct;
            if (!data.products.find(existing => existing.id === product.id)) {
                data.products.push(product);
            }
        }
    }

    // Extract collections
    if (Array.isArray(result.collections)) {
        for (const c of result.collections) {
            const collection = c as ChatCollection;
            if (!data.collections.find(existing => existing.id === collection.id)) {
                data.collections.push(collection);
            }
        }
    }

    // Extract action signals
    if (result.addToCartAction) {
        data.addToCartAction = result.addToCartAction as AddToCartAction;
    }
    if (result.activeOrder) {
        data.activeOrder = result.activeOrder as ChatActiveOrder;
    }

    // Extract orders (from getOrderHistory / trackOrder)
    if (Array.isArray(result.orders) && result.orders.length > 0) {
        data.orders = result.orders as ChatOrder[];
    }

    // Extract promotions (from getAvailablePromotions)
    if (Array.isArray(result.promotions) && result.promotions.length > 0) {
        if (!data.promotions) data.promotions = [];
        for (const promo of result.promotions) {
            const promotion = promo as ChatPromotion;
            if (!data.promotions.find(existing => existing.id === promotion.id)) {
                data.promotions.push(promotion);
            }
        }
    }

    // Extract coupon action signal (from applyCouponCode / removeCouponCode)
    if (result.applyCouponAction) {
        data.applyCouponAction = result.applyCouponAction as ApplyCouponAction;
    }
}

/** Extract structured data (products, collections, cart actions) from a UIMessage's tool parts */
export function extractDataFromMessage(message: UIMessage): ExtractedData {
    const data: ExtractedData = { products: [], collections: [] };

    if (!message.parts) return data;

    for (const part of message.parts) {
        const p = part as Record<string, unknown>;

        // Static tool parts: type is "tool-<toolName>"
        if (typeof p.type === 'string' && p.type.startsWith('tool-') && p.state === 'output-available' && p.output) {
            extractToolOutput(p, data);
        }

        // Dynamic tool parts
        if (p.type === 'dynamic-tool' && p.state === 'output-available' && p.output) {
            extractToolOutput(p, data);
        }
    }

    return data;
}

/** Get the text content from message parts */
export function getMessageText(message: UIMessage): string {
    if (!message.parts) return '';
    return message.parts
        .filter((p): p is { type: 'text'; text: string } => (p as Record<string, unknown>).type === 'text')
        .map(p => p.text)
        .join('');
}
