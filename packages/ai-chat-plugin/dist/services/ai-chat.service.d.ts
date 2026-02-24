import { OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { streamText } from 'ai';
import { RequestContext, TransactionalConnection, OrderService, CustomerService, ConfigService } from '@vendure/core';
import { type AiAssistantPluginOptions } from '../constants';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';
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
export declare class AiChatService implements OnModuleInit {
    private options;
    private connection;
    private moduleRef;
    private embeddingService;
    private productEmbeddingService;
    private collectionEmbeddingService;
    private orderService;
    private customerService;
    private configService;
    private readonly logger;
    private openai;
    private fulltextSearchService;
    private assetUrlPrefix;
    constructor(options: AiAssistantPluginOptions, connection: TransactionalConnection, moduleRef: ModuleRef, embeddingService: EmbeddingService, productEmbeddingService: ProductEmbeddingService, collectionEmbeddingService: CollectionEmbeddingService, orderService: OrderService, customerService: CustomerService, configService: ConfigService);
    onModuleInit(): Promise<void>;
    private resolveAssetUrl;
    private buildTools;
    streamChat(ctx: RequestContext, userMessage: string, conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, customerId?: string | number): ReturnType<typeof streamText>;
    chat(ctx: RequestContext, userMessage: string, conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, customerId?: string | number): Promise<ChatResult>;
    private toolSearchProducts;
    private toolVectorSearch;
    private toolGetCollections;
    private toolFilterByPrice;
    private toolAddToCart;
    private toolGetActiveOrder;
    private toolAdjustOrderLine;
    /**
     * getOrderHistory: fetches the customer's past orders using raw query for reliable relation loading.
     */
    private toolGetOrderHistory;
    private toolTrackOrder;
    private toolGetAvailableCountries;
    private toolGetEligibleShippingMethods;
    private toolSetShippingAddress;
    private toolSetBillingAddress;
    private toolSetShippingMethod;
    private mapOrders;
    private mapActiveOrder;
    private mapProducts;
    private mapCollections;
    private loadProductsByIds;
    private loadCollectionsByIds;
    private mergeProducts;
    private mergeCollections;
}
//# sourceMappingURL=ai-chat.service.d.ts.map