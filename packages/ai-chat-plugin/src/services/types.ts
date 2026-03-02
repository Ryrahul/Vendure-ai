/** Structured product returned in chat responses */
export interface AiChatProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
    variantId: string;
}

/** Structured collection returned in chat responses */
export interface AiChatCollection {
    id: string;
    name: string;
    slug: string;
}

/** Action signal for the frontend to execute add-to-cart */
export interface AddToCartAction {
    variantId: string;
    quantity: number;
    productName?: string;
}

/** Structured order returned in chat responses */
export interface AiChatOrder {
    id: string;
    code: string;
    state: string;
    total: number;
    orderPlacedAt: string | null;
    lines: Array<{
        productName: string;
        quantity: number;
        translations?: {
            name: string;
        }[];
    }>;
    fulfillments: Array<{
        state: string;
        method: string;
        trackingCode: string | null;
    }>;
}

/** A single line item in the active cart */
export interface AiCartLine {
    orderLineId: string;
    productName: string;
    variantId: string;
    quantity: number;
    linePriceWithTax: number;
}

/** The active order (cart) summary */
export interface AiActiveOrder {
    id: string;
    code: string;
    totalQuantity: number;
    totalWithTax: number;
    lines: AiCartLine[];
}

/** Action signal for the frontend to set shipping address */
export interface SetShippingAddressAction {
    fullName: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
    phoneNumber: string;
    company?: string;
}

/** Action signal for the frontend to set billing address */
export interface SetBillingAddressAction {
    fullName: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
    phoneNumber: string;
    company?: string;
}

/** Action signal for the frontend to set shipping method */
export interface SetShippingMethodAction {
    shippingMethodId: string;
}

export interface ChatResult {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    addToCartAction?: AddToCartAction;
    orders?: AiChatOrder[];
    activeOrder?: AiActiveOrder;
    setShippingAddressAction?: SetShippingAddressAction;
    setBillingAddressAction?: SetBillingAddressAction;
    setShippingMethodAction?: SetShippingMethodAction;
}

/** Result type for streaming chat — returns a ReadableStream + structured data promise */
export interface StreamingChatResult {
    stream: ReadableStream<Uint8Array>;
    dataPromise: Promise<Omit<ChatResult, 'message'>>;
}

/** Standard return type used by all tool implementations */
export interface ToolResult {
    products: AiChatProduct[];
    collections: AiChatCollection[];
    summary: string;
    addToCartAction?: AddToCartAction;
    orders?: AiChatOrder[];
    activeOrder?: AiActiveOrder;
    setShippingAddressAction?: SetShippingAddressAction;
    setBillingAddressAction?: SetBillingAddressAction;
    setShippingMethodAction?: SetShippingMethodAction;
}
