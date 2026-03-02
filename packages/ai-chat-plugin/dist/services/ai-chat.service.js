"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AiChatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiChatService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const ai_1 = require("ai");
const openai_1 = require("@ai-sdk/openai");
const zod_1 = require("zod");
const core_2 = require("@vendure/core");
const constants_1 = require("../constants");
const embedding_service_1 = require("./embedding.service");
const product_embedding_service_1 = require("./product-embedding.service");
const collection_embedding_service_1 = require("./collection-embedding.service");
const chat_result_mapper_1 = require("./chat-result-mapper");
const search_tools_1 = require("./tools/search-tools");
const cart_tools_1 = require("./tools/cart-tools");
const order_tools_1 = require("./tools/order-tools");
const checkout_tools_1 = require("./tools/checkout-tools");
const system_prompt_1 = require("./system-prompt");
// Tool definitions are created inline in the chat/streamChat methods using Vercel AI SDK tool() + zod schemas
let AiChatService = AiChatService_1 = class AiChatService {
    constructor(options, connection, moduleRef, embeddingService, productEmbeddingService, collectionEmbeddingService, orderService, customerService, configService) {
        this.options = options;
        this.connection = connection;
        this.moduleRef = moduleRef;
        this.embeddingService = embeddingService;
        this.productEmbeddingService = productEmbeddingService;
        this.collectionEmbeddingService = collectionEmbeddingService;
        this.orderService = orderService;
        this.customerService = customerService;
        this.configService = configService;
        this.logger = new common_1.Logger(AiChatService_1.name);
        this.assetUrlPrefix = '';
        this.openai = (0, openai_1.createOpenAI)({ apiKey: options.openaiApiKey });
    }
    async onModuleInit() {
        try {
            // Dynamically resolve FulltextSearchService from DefaultSearchPlugin's module
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = require('@vendure/core/dist/plugin/default-search-plugin/fulltext-search.service');
            this.fulltextSearchService = this.moduleRef.get(mod.FulltextSearchService, { strict: false });
            this.logger.log('FulltextSearchService resolved successfully');
        }
        catch (e) {
            this.logger.warn('FulltextSearchService not available, falling back to DB queries for search');
        }
        // Resolve asset URL prefix: explicit config > auto-detect from apiOptions
        if (this.options.assetBaseUrl) {
            this.assetUrlPrefix = this.options.assetBaseUrl.endsWith('/')
                ? this.options.assetBaseUrl
                : this.options.assetBaseUrl + '/';
            this.logger.log(`Asset URL prefix from config: ${this.assetUrlPrefix}`);
        }
        else {
            try {
                const { apiOptions } = this.configService;
                const hostname = apiOptions.hostname || 'localhost';
                const port = apiOptions.port || 3000;
                this.assetUrlPrefix = `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}/assets/`;
                this.logger.log(`Asset URL prefix auto-detected: ${this.assetUrlPrefix}`);
            }
            catch (e) {
                this.assetUrlPrefix = '/assets/';
                this.logger.warn(`Could not resolve asset URL prefix, using relative: ${this.assetUrlPrefix}`);
            }
        }
        // Initialize helper classes
        this.mapper = new chat_result_mapper_1.ChatResultMapper(this.connection, this.assetUrlPrefix);
        this.searchTools = new search_tools_1.SearchTools(this.connection, this.embeddingService, this.productEmbeddingService, this.collectionEmbeddingService, this.mapper, this.fulltextSearchService);
        this.cartTools = new cart_tools_1.CartTools(this.connection, this.orderService, this.mapper);
        this.orderTools = new order_tools_1.OrderTools(this.connection, this.mapper);
        this.checkoutTools = new checkout_tools_1.CheckoutTools(this.connection, this.orderService);
    }
    buildTools(ctx, customerId) {
        return {
            searchProducts: (0, ai_1.tool)({
                description: 'Search for products by keyword or product name. Returns products with their id, name, slug, price, image, and variantId.',
                inputSchema: zod_1.z.object({
                    query: zod_1.z.string().describe('The search term or product keyword'),
                    take: zod_1.z.number().optional().describe('Number of results to return (default 10, max 20)'),
                }),
                execute: async ({ query, take }) => this.searchTools.searchProducts(ctx, { query, take }),
            }),
            vectorSearch: (0, ai_1.tool)({
                description: 'Semantic/intent-based product search. Use for vague queries like "gift for dad", "something romantic".',
                inputSchema: zod_1.z.object({
                    query: zod_1.z.string().describe('The semantic search query'),
                }),
                execute: async ({ query }) => this.searchTools.vectorSearch(ctx, { query }),
            }),
            getCollections: (0, ai_1.tool)({
                description: 'Get available product collections/categories in the store.',
                inputSchema: zod_1.z.object({
                    query: zod_1.z.string().optional().describe('Optional search term to filter collections'),
                }),
                execute: async ({ query }) => this.searchTools.getCollections(ctx, { query }),
            }),
            filterByPrice: (0, ai_1.tool)({
                description: 'Filter products by price range / budget. Prices are in the smallest currency unit (cents). "under 50 dollars" = maxPrice 5000.',
                inputSchema: zod_1.z.object({
                    minPrice: zod_1.z.number().optional().describe('Min price in cents'),
                    maxPrice: zod_1.z.number().optional().describe('Max price in cents'),
                    query: zod_1.z.string().optional().describe('Optional keyword to narrow results (e.g. "laptop")'),
                }),
                execute: async ({ minPrice, maxPrice, query }) => this.searchTools.filterByPrice(ctx, { minPrice, maxPrice, query }),
            }),
            addToCart: (0, ai_1.tool)({
                description: 'Add a product to the customer\'s shopping cart. The variantId MUST be the exact numeric ID from a previous search result. Never guess or fabricate a variantId.',
                inputSchema: zod_1.z.object({
                    variantId: zod_1.z.string().describe('The EXACT numeric variant ID from a previous search result'),
                    quantity: zod_1.z.number().optional().describe('Quantity to add (default 1)'),
                    productName: zod_1.z.string().optional().describe('The product name (for confirmation)'),
                }),
                execute: async ({ variantId, quantity, productName }) => this.cartTools.addToCart(ctx, { variantId, quantity, productName }),
            }),
            getActiveOrder: (0, ai_1.tool)({
                description: 'Get the customer\'s current shopping cart (active order). Returns all line items with product names, quantities, prices, and the cart total.',
                inputSchema: zod_1.z.object({}),
                execute: async () => this.cartTools.getActiveOrder(ctx, {}),
            }),
            adjustOrderLine: (0, ai_1.tool)({
                description: 'Adjust the quantity of an item in the customer\'s cart, or remove it. Requires the orderLineId from getActiveOrder results. Set quantity to 0 to remove the item.',
                inputSchema: zod_1.z.object({
                    orderLineId: zod_1.z.string().describe('The order line ID from getActiveOrder results'),
                    quantity: zod_1.z.number().describe('The new absolute quantity. Set to 0 to remove.'),
                }),
                execute: async ({ orderLineId, quantity }) => this.cartTools.adjustOrderLine(ctx, { orderLineId, quantity }),
            }),
            getOrderHistory: (0, ai_1.tool)({
                description: 'Get the customer\'s past orders. Returns a list of orders with code, state, total, date, and items ordered.',
                inputSchema: zod_1.z.object({
                    take: zod_1.z.number().optional().describe('Max number of orders to return (default 5, max 10)'),
                }),
                execute: async ({ take }) => this.orderTools.getOrderHistory(ctx, { take }, customerId),
            }),
            trackOrder: (0, ai_1.tool)({
                description: 'Get the status and tracking information for a specific order.',
                inputSchema: zod_1.z.object({
                    orderId: zod_1.z.string().optional().describe('The order ID (numeric)'),
                    orderCode: zod_1.z.string().optional().describe('The order code (e.g. "A1B2C3D4")'),
                }),
                execute: async ({ orderId, orderCode }) => this.orderTools.trackOrder(ctx, { orderId, orderCode }, customerId),
            }),
            getAvailableCountries: (0, ai_1.tool)({
                description: 'List countries available for shipping/billing addresses.',
                inputSchema: zod_1.z.object({}),
                execute: async () => this.checkoutTools.getAvailableCountries(ctx),
            }),
            getEligibleShippingMethods: (0, ai_1.tool)({
                description: 'Get available shipping methods for the active order. Call after the shipping address has been set.',
                inputSchema: zod_1.z.object({}),
                execute: async () => this.checkoutTools.getEligibleShippingMethods(ctx),
            }),
            setShippingAddress: (0, ai_1.tool)({
                description: 'Set the shipping address on the active order. Requires all address fields.',
                inputSchema: zod_1.z.object({
                    fullName: zod_1.z.string().describe('Full name of the recipient'),
                    streetLine1: zod_1.z.string().describe('Street address line 1'),
                    streetLine2: zod_1.z.string().optional().describe('Street address line 2'),
                    city: zod_1.z.string().describe('City'),
                    province: zod_1.z.string().describe('State/province'),
                    postalCode: zod_1.z.string().describe('Postal/ZIP code'),
                    countryCode: zod_1.z.string().describe('Two-letter country code (e.g. "US", "GB")'),
                    phoneNumber: zod_1.z.string().describe('Phone number'),
                    company: zod_1.z.string().optional().describe('Company name'),
                }),
                execute: async (params) => this.checkoutTools.setShippingAddress(ctx, params),
            }),
            setBillingAddress: (0, ai_1.tool)({
                description: 'Set the billing address on the active order. Can be the same as shipping address.',
                inputSchema: zod_1.z.object({
                    fullName: zod_1.z.string().describe('Full name'),
                    streetLine1: zod_1.z.string().describe('Street address line 1'),
                    streetLine2: zod_1.z.string().optional().describe('Street address line 2'),
                    city: zod_1.z.string().describe('City'),
                    province: zod_1.z.string().describe('State/province'),
                    postalCode: zod_1.z.string().describe('Postal/ZIP code'),
                    countryCode: zod_1.z.string().describe('Two-letter country code'),
                    phoneNumber: zod_1.z.string().describe('Phone number'),
                    company: zod_1.z.string().optional().describe('Company name'),
                }),
                execute: async (params) => this.checkoutTools.setBillingAddress(ctx, params),
            }),
            setShippingMethod: (0, ai_1.tool)({
                description: 'Set the chosen shipping method on the active order. Use the id from getEligibleShippingMethods.',
                inputSchema: zod_1.z.object({
                    shippingMethodId: zod_1.z.string().describe('The shipping method ID from getEligibleShippingMethods'),
                }),
                execute: async ({ shippingMethodId }) => this.checkoutTools.setShippingMethod(ctx, { shippingMethodId }),
            }),
        };
    }
    streamChat(ctx, userMessage, conversationHistory = [], customerId) {
        const messages = [
            { role: 'system', content: system_prompt_1.SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];
        const tools = this.buildTools(ctx, customerId);
        return (0, ai_1.streamText)({
            model: this.openai('gpt-4o-mini'),
            messages,
            tools,
            stopWhen: (0, ai_1.stepCountIs)(5),
            temperature: 0.7,
            maxOutputTokens: 1024,
            onStepFinish: (step) => {
                if (step.toolResults && step.toolResults.length > 0) {
                    for (const result of step.toolResults) {
                        this.logger.log(`Tool "${result.toolName}" completed`);
                    }
                }
            },
            onError: (event) => {
                this.logger.error(`streamText error: ${event.error}`);
            },
        });
    }
    // yo chai stream bina use garna paryo vanee kailee
    async chat(ctx, userMessage, conversationHistory = [], customerId) {
        var _a, _b, _c, _d;
        const result = this.streamChat(ctx, userMessage, conversationHistory, customerId);
        const text = await result.text;
        const steps = await result.steps;
        let allProducts = [];
        let allCollections = [];
        let allOrders = [];
        let addToCartAction;
        let activeOrder;
        let setShippingAddressAction;
        let setBillingAddressAction;
        let setShippingMethodAction;
        for (const step of steps) {
            for (const toolResult of step.toolResults) {
                const data = (_a = toolResult.output) !== null && _a !== void 0 ? _a : toolResult.result;
                if (!data)
                    continue;
                if (((_b = data.products) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                    allProducts = this.mapper.mergeProducts(allProducts, data.products);
                }
                if (((_c = data.collections) === null || _c === void 0 ? void 0 : _c.length) > 0) {
                    allCollections = this.mapper.mergeCollections(allCollections, data.collections);
                }
                if (((_d = data.orders) === null || _d === void 0 ? void 0 : _d.length) > 0) {
                    allOrders = data.orders;
                }
                if (data.addToCartAction) {
                    addToCartAction = data.addToCartAction;
                }
                if (data.activeOrder) {
                    activeOrder = data.activeOrder;
                }
                if (data.setShippingAddressAction) {
                    setShippingAddressAction = data.setShippingAddressAction;
                }
                if (data.setBillingAddressAction) {
                    setBillingAddressAction = data.setBillingAddressAction;
                }
                if (data.setShippingMethodAction) {
                    setShippingMethodAction = data.setShippingMethodAction;
                }
            }
        }
        return {
            message: text,
            products: allProducts.slice(0, constants_1.MAX_CHAT_PRODUCTS),
            collections: allCollections.slice(0, constants_1.MAX_CHAT_COLLECTIONS),
            addToCartAction,
            orders: allOrders.length > 0 ? allOrders : undefined,
            activeOrder,
            setShippingAddressAction,
            setBillingAddressAction,
            setShippingMethodAction,
        };
    }
};
exports.AiChatService = AiChatService;
exports.AiChatService = AiChatService = AiChatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(constants_1.AI_ASSISTANT_OPTIONS)),
    __metadata("design:paramtypes", [Object, core_2.TransactionalConnection,
        core_1.ModuleRef,
        embedding_service_1.EmbeddingService,
        product_embedding_service_1.ProductEmbeddingService,
        collection_embedding_service_1.CollectionEmbeddingService,
        core_2.OrderService,
        core_2.CustomerService,
        core_2.ConfigService])
], AiChatService);
//# sourceMappingURL=ai-chat.service.js.map