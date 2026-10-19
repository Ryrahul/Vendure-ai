/** Structured product returned in chat responses */
export interface AiChatProduct {
    id: string;
    name: string;
    slug: string;
    /** Price in the smallest currency unit (tax included when available). */
    price: number;
    /** ISO currency code of `price`. */
    currencyCode?: string;
    image: string | null;
    variantId: string;
    /** Only set when the search engine reports stock. */
    inStock?: boolean;
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
/** A single line item in an order history entry */
export interface AiChatOrderLine {
    productName: string;
    quantity: number;
    slug: string;
    variantId: string;
    image: string | null;
    linePriceWithTax: number;
}

/** Structured order returned in chat responses */
export interface AiChatOrder {
    id: string;
    code: string;
    state: string;
    total: number;
    /** ISO currency code of the order's prices. */
    currencyCode?: string;
    orderPlacedAt: string | null;
    lines: AiChatOrderLine[];
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
    /** ISO currency code of the order's prices. */
    currencyCode?: string;
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

/** A promotion available to the customer */
export interface AiPromotion {
    id: string;
    name: string;
    description: string;
    couponCode?: string;
    /** True when the promotion needs a coupon code (the code itself may be withheld). */
    requiresCouponCode?: boolean;
    startsAt?: string;
    endsAt?: string;
    perCustomerUsageLimit?: number;
    conditions?: string[];
    discountSummary?: string;
}

/** Action signal for applying/removing a coupon code */
export interface ApplyCouponAction {
    couponCode: string;
    applied: boolean;
}

/** Token usage from the AI model response */
export interface AiTokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
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
    promotions?: AiPromotion[];
    applyCouponAction?: ApplyCouponAction;
    usage?: AiTokenUsage;
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
    promotions?: AiPromotion[];
    applyCouponAction?: ApplyCouponAction;
}
