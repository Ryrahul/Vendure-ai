import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { streamText, tool, stepCountIs, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import { z } from 'zod';
import {
    RequestContext, TransactionalConnection, ConfigService,
    ProductService, ProductVariantService, ProductOptionGroupService, ProductOptionService,
    TaxCategoryService, CustomerService, CollectionService,
    FacetService, FacetValueService, ShippingMethodService, PaymentMethodService,
    TaxRateService, ZoneService, CountryService,
    AdministratorService, RoleService, ChannelService, SellerService,
    GlobalSettingsService, PromotionService, AssetService,
    CustomerGroupService, StockLocationService,
} from '@vendure/core';
import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions, MAX_CHAT_PRODUCTS } from '../constants';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';
import { ChatResultMapper } from './chat-result-mapper';
import { AdminProductTools } from './admin-tools/admin-product-tools';
import { restrictAdminTools } from './admin-tool-permissions';
import { AdminOrderTools } from './admin-tools/admin-order-tools';
import { AdminCustomerTools } from './admin-tools/admin-customer-tools';
import { AdminCollectionTools } from './admin-tools/admin-collection-tools';
import { AdminShippingTools } from './admin-tools/admin-shipping-tools';
import { AdminPaymentTools } from './admin-tools/admin-payment-tools';
import { AdminTaxTools } from './admin-tools/admin-tax-tools';
import { AdminFacetTools } from './admin-tools/admin-facet-tools';
import { AdminSettingsTools } from './admin-tools/admin-settings-tools';
import { AdminStaffTools } from './admin-tools/admin-staff-tools';
import { AdminPromotionTools } from './admin-tools/admin-promotion-tools';
import { AdminCountryTools } from './admin-tools/admin-country-tools';
import { AdminAssetTools } from './admin-tools/admin-asset-tools';
import { AdminCustomerGroupTools } from './admin-tools/admin-customer-group-tools';
import { AdminStockLocationTools } from './admin-tools/admin-stock-location-tools';
import { ADMIN_SYSTEM_PROMPT } from './admin-system-prompt';
import type { AiChatProduct, AiChatCollection, AiChatOrder, AiTokenUsage } from './types';

export interface AdminChatResult {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    orders?: AiChatOrder[];
    navigateTo?: string;
    usage?: AiTokenUsage;
}

@Injectable()
export class AdminAiChatService implements OnModuleInit {
    private readonly logger = new Logger(AdminAiChatService.name);
    private openai: ReturnType<typeof createOpenAI>;
    private azure: ReturnType<typeof createAzure> | null = null;
    private azureDeploymentName: string = '';
    private assetUrlPrefix: string = '';

    private mapper!: ChatResultMapper;
    private productTools!: AdminProductTools;
    private orderTools!: AdminOrderTools;
    private customerTools!: AdminCustomerTools;
    private collectionTools!: AdminCollectionTools;
    private shippingTools!: AdminShippingTools;
    private paymentTools!: AdminPaymentTools;
    private taxTools!: AdminTaxTools;
    private facetTools!: AdminFacetTools;
    private settingsTools!: AdminSettingsTools;
    private staffTools!: AdminStaffTools;
    private promotionTools!: AdminPromotionTools;
    private countryTools!: AdminCountryTools;
    private assetTools!: AdminAssetTools;
    private customerGroupTools!: AdminCustomerGroupTools;
    private stockLocationTools!: AdminStockLocationTools;

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        private configService: ConfigService,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private productOptionGroupService: ProductOptionGroupService,
        private productOptionService: ProductOptionService,
        private taxCategoryService: TaxCategoryService,
        private customerService: CustomerService,
        private collectionService: CollectionService,
        private facetService: FacetService,
        private facetValueService: FacetValueService,
        private shippingMethodService: ShippingMethodService,
        private paymentMethodService: PaymentMethodService,
        private taxRateService: TaxRateService,
        private zoneService: ZoneService,
        private countryService: CountryService,
        private administratorService: AdministratorService,
        private roleService: RoleService,
        private channelService: ChannelService,
        private sellerService: SellerService,
        private globalSettingsService: GlobalSettingsService,
        private promotionService: PromotionService,
        private assetService: AssetService,
        private customerGroupService: CustomerGroupService,
        private stockLocationService: StockLocationService,
    ) {
        this.openai = createOpenAI({ apiKey: options.openaiApiKey });
        if (options.azureOpenai) {
            this.azure = createAzure({
                apiKey: options.azureOpenai.apiKey,
                resourceName: options.azureOpenai.resourceName,
            });
            this.azureDeploymentName = options.azureOpenai.deploymentName;
        }
    }

    async onModuleInit() {
        if (this.options.assetBaseUrl) {
            this.assetUrlPrefix = this.options.assetBaseUrl.endsWith('/') ? this.options.assetBaseUrl : this.options.assetBaseUrl + '/';
        } else {
            try {
                const { apiOptions } = this.configService;
                const hostname = apiOptions.hostname || 'localhost';
                const port = apiOptions.port || 3000;
                this.assetUrlPrefix = `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}/assets/`;
            } catch { this.assetUrlPrefix = '/assets/'; }
        }

        this.mapper = new ChatResultMapper(this.connection, this.assetUrlPrefix);
        this.productTools = new AdminProductTools(this.connection, this.mapper, undefined, this.embeddingService, this.productEmbeddingService, this.collectionEmbeddingService, this.productService, this.productVariantService, this.productOptionGroupService, this.productOptionService, this.taxCategoryService);
        this.orderTools = new AdminOrderTools(this.connection, this.mapper);
        this.customerTools = new AdminCustomerTools(this.connection, this.customerService);
        this.collectionTools = new AdminCollectionTools(this.connection, this.collectionService);
        this.shippingTools = new AdminShippingTools(this.connection, this.shippingMethodService);
        this.paymentTools = new AdminPaymentTools(this.connection, this.paymentMethodService);
        this.taxTools = new AdminTaxTools(this.connection, this.taxCategoryService, this.taxRateService, this.zoneService);
        this.facetTools = new AdminFacetTools(this.connection, this.facetService, this.facetValueService);
        this.settingsTools = new AdminSettingsTools(this.connection, this.globalSettingsService, this.channelService, this.sellerService);
        this.staffTools = new AdminStaffTools(this.connection, this.administratorService, this.roleService);
        this.promotionTools = new AdminPromotionTools(this.connection, this.promotionService);
        this.countryTools = new AdminCountryTools(this.connection, this.countryService);
        this.assetTools = new AdminAssetTools(this.connection, this.assetService);
        this.customerGroupTools = new AdminCustomerGroupTools(this.connection, this.customerGroupService);
        this.stockLocationTools = new AdminStockLocationTools(this.connection, this.stockLocationService);
    }

    private buildTools(ctx: RequestContext): ToolSet {
        return {
            // ── Products (read) ──
            searchProducts: tool({ description: 'Search products by keyword, or list all products if no query given. Returns product cards.', inputSchema: z.object({ query: z.string().optional().describe('Search term. Omit to list all products.'), take: z.number().optional(), includeDisabled: z.boolean().optional() }), execute: async (a) => this.productTools.searchProducts(ctx, a) }),
            vectorSearch: tool({ description: 'Semantic product search for vague queries like "gifts for dad".', inputSchema: z.object({ query: z.string() }), execute: async (a) => this.productTools.vectorSearch(ctx, a) }),
            getProductDetails: tool({ description: 'Get full product details by ID or slug including all variants.', inputSchema: z.object({ productId: z.string().optional(), slug: z.string().optional() }), execute: async (a) => this.productTools.getProductDetails(ctx, a) }),
            // ── Products (write) ──
            createProduct: tool({ description: 'Create a simple product without variants. Use createProductWithVariants for full creation.', inputSchema: z.object({ name: z.string(), slug: z.string().optional(), description: z.string().optional(), enabled: z.boolean().optional() }), execute: async (a) => this.productTools.createProduct(ctx, a) }),
            updateProduct: tool({ description: 'Update a product name, slug, description, or enabled status.', inputSchema: z.object({ productId: z.string(), name: z.string().optional(), slug: z.string().optional(), description: z.string().optional(), enabled: z.boolean().optional() }), execute: async (a) => this.productTools.updateProduct(ctx, a) }),
            deleteProduct: tool({ description: 'Soft-delete a product by ID.', inputSchema: z.object({ productId: z.string() }), execute: async (a) => this.productTools.deleteProduct(ctx, a) }),
            createProductWithVariants: tool({ description: 'Create a complete product with option groups and variants. Each variant needs unique option values. Prices in cents.', inputSchema: z.object({ name: z.string(), slug: z.string().optional(), description: z.string().optional(), enabled: z.boolean().optional(), optionGroups: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).optional().describe('Option groups like Color, Size'), variants: z.array(z.object({ name: z.string(), sku: z.string(), price: z.number().describe('Price in cents'), stockOnHand: z.number().optional(), optionValues: z.array(z.string()).optional().describe('Option values matching the option groups') })) }), execute: async (a) => this.productTools.createProductWithVariants(ctx, a) }),
            updateProductVariant: tool({ description: 'Update a variant price (cents), SKU, stock, or enabled status.', inputSchema: z.object({ variantId: z.string(), price: z.number().optional(), sku: z.string().optional(), stockOnHand: z.number().optional(), enabled: z.boolean().optional() }), execute: async (a) => this.productTools.updateProductVariant(ctx, a) }),
            deleteProductVariant: tool({ description: 'Soft-delete a product variant.', inputSchema: z.object({ variantId: z.string() }), execute: async (a) => this.productTools.deleteProductVariant(ctx, a) }),
            // ── Orders (read) ──
            searchOrders: tool({ description: 'Search orders by code, customer name/email, or state.', inputSchema: z.object({ orderCode: z.string().optional(), customerName: z.string().optional(), state: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.orderTools.searchOrders(ctx, a) }),
            getOrderDetails: tool({ description: 'Get full order details including lines, payments, fulfillments, addresses.', inputSchema: z.object({ orderId: z.string().optional(), orderCode: z.string().optional() }), execute: async (a) => this.orderTools.getOrderDetails(ctx, a) }),
            // ── Customers (read) ──
            searchCustomers: tool({ description: 'Search customers by name or email, or list all customers if no query given.', inputSchema: z.object({ query: z.string().optional().describe('Search term. Omit to list all customers.'), take: z.number().optional() }), execute: async (a) => this.customerTools.searchCustomers(ctx, a) }),
            getCustomerDetails: tool({ description: 'Get full customer details: addresses, orders, groups.', inputSchema: z.object({ customerId: z.string() }), execute: async (a) => this.customerTools.getCustomerDetails(ctx, a) }),
            // ── Customers (write) ──
            createCustomer: tool({ description: 'Create a new customer.', inputSchema: z.object({ firstName: z.string(), lastName: z.string(), emailAddress: z.string(), phoneNumber: z.string().optional(), title: z.string().optional() }), execute: async (a) => this.customerTools.createCustomer(ctx, a) }),
            updateCustomer: tool({ description: 'Update customer details.', inputSchema: z.object({ customerId: z.string(), firstName: z.string().optional(), lastName: z.string().optional(), emailAddress: z.string().optional(), phoneNumber: z.string().optional() }), execute: async (a) => this.customerTools.updateCustomer(ctx, a) }),
            deleteCustomer: tool({ description: 'Soft-delete a customer.', inputSchema: z.object({ customerId: z.string() }), execute: async (a) => this.customerTools.deleteCustomer(ctx, a) }),
            createCustomerAddress: tool({ description: 'Create an address for a customer.', inputSchema: z.object({ customerId: z.string(), fullName: z.string(), streetLine1: z.string(), streetLine2: z.string().optional(), city: z.string(), province: z.string(), postalCode: z.string(), countryCode: z.string(), phoneNumber: z.string().optional(), company: z.string().optional(), defaultShippingAddress: z.boolean().optional(), defaultBillingAddress: z.boolean().optional() }), execute: async (a) => this.customerTools.createCustomerAddress(ctx, a) }),
            addNoteToCustomer: tool({ description: 'Add a note to customer history.', inputSchema: z.object({ customerId: z.string(), note: z.string(), isPublic: z.boolean().optional() }), execute: async (a) => this.customerTools.addNoteToCustomer(ctx, a) }),
            // ── Collections (read + write) ──
            getCollections: tool({ description: 'List or search collections.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.collectionTools.getCollections(ctx, a) }),
            createCollection: tool({ description: 'Create a new collection. Filters define which products are included (e.g. facet-value-filter).', inputSchema: z.object({ name: z.string(), slug: z.string().optional(), description: z.string().optional(), parentId: z.string().optional(), isPrivate: z.boolean().optional(), filters: z.array(z.object({ code: z.string(), args: z.record(z.string(), z.string()) })).optional() }), execute: async (a) => this.collectionTools.createCollection(ctx, a) }),
            updateCollection: tool({ description: 'Update a collection.', inputSchema: z.object({ collectionId: z.string(), name: z.string().optional(), slug: z.string().optional(), description: z.string().optional(), isPrivate: z.boolean().optional() }), execute: async (a) => this.collectionTools.updateCollection(ctx, a) }),
            deleteCollection: tool({ description: 'Delete a collection and its descendants.', inputSchema: z.object({ collectionId: z.string() }), execute: async (a) => this.collectionTools.deleteCollection(ctx, a) }),
            moveCollection: tool({ description: 'Move a collection to a different parent.', inputSchema: z.object({ collectionId: z.string(), parentId: z.string(), index: z.number() }), execute: async (a) => this.collectionTools.moveCollection(ctx, a) }),
            // ── Facets (read + write) ──
            getFacets: tool({ description: 'List facets with values.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.facetTools.getFacets(ctx, a) }),
            getFacetValues: tool({ description: 'List facet values, optionally by facet ID.', inputSchema: z.object({ facetId: z.string().optional(), query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.facetTools.getFacetValues(ctx, a) }),
            createFacet: tool({ description: 'Create a new facet with optional initial values.', inputSchema: z.object({ name: z.string(), code: z.string(), isPrivate: z.boolean().optional(), values: z.array(z.object({ name: z.string(), code: z.string() })).optional() }), execute: async (a) => this.facetTools.createFacet(ctx, a) }),
            updateFacet: tool({ description: 'Update a facet name, code, or privacy.', inputSchema: z.object({ facetId: z.string(), name: z.string().optional(), code: z.string().optional(), isPrivate: z.boolean().optional() }), execute: async (a) => this.facetTools.updateFacet(ctx, a) }),
            deleteFacet: tool({ description: 'Delete a facet. Use force=true to delete even if in use.', inputSchema: z.object({ facetId: z.string(), force: z.boolean().optional() }), execute: async (a) => this.facetTools.deleteFacet(ctx, a) }),
            createFacetValues: tool({ description: 'Add values to an existing facet.', inputSchema: z.object({ facetId: z.string(), values: z.array(z.object({ name: z.string(), code: z.string() })) }), execute: async (a) => this.facetTools.createFacetValues(ctx, a) }),
            updateFacetValue: tool({ description: 'Update a facet value name or code.', inputSchema: z.object({ facetValueId: z.string(), name: z.string().optional(), code: z.string().optional() }), execute: async (a) => this.facetTools.updateFacetValue(ctx, a) }),
            deleteFacetValues: tool({ description: 'Delete facet values by IDs.', inputSchema: z.object({ facetValueIds: z.array(z.string()), force: z.boolean().optional() }), execute: async (a) => this.facetTools.deleteFacetValues(ctx, a) }),
            // ── Shipping Methods ──
            getShippingMethods: tool({ description: 'List shipping methods.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional(), includeDeleted: z.boolean().optional() }), execute: async (a) => this.shippingTools.getShippingMethods(ctx, a) }),
            createShippingMethod: tool({ description: 'Create a shipping method.', inputSchema: z.object({ name: z.string(), code: z.string(), description: z.string().optional(), fulfillmentHandler: z.string().describe('e.g. manual-fulfillment') }), execute: async (a) => this.shippingTools.createShippingMethod(ctx, a) }),
            updateShippingMethod: tool({ description: 'Update a shipping method.', inputSchema: z.object({ shippingMethodId: z.string(), name: z.string().optional(), code: z.string().optional(), description: z.string().optional() }), execute: async (a) => this.shippingTools.updateShippingMethod(ctx, a) }),
            deleteShippingMethod: tool({ description: 'Soft-delete a shipping method.', inputSchema: z.object({ shippingMethodId: z.string() }), execute: async (a) => this.shippingTools.deleteShippingMethod(ctx, a) }),
            // ── Payment Methods ──
            getPaymentMethods: tool({ description: 'List payment methods.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.paymentTools.getPaymentMethods(ctx, a) }),
            createPaymentMethod: tool({ description: 'Create a payment method.', inputSchema: z.object({ name: z.string(), code: z.string(), description: z.string().optional(), enabled: z.boolean().optional(), handlerCode: z.string().describe('e.g. dummy-payment-handler') }), execute: async (a) => this.paymentTools.createPaymentMethod(ctx, a) }),
            updatePaymentMethod: tool({ description: 'Update a payment method.', inputSchema: z.object({ paymentMethodId: z.string(), name: z.string().optional(), code: z.string().optional(), description: z.string().optional(), enabled: z.boolean().optional() }), execute: async (a) => this.paymentTools.updatePaymentMethod(ctx, a) }),
            deletePaymentMethod: tool({ description: 'Delete a payment method.', inputSchema: z.object({ paymentMethodId: z.string(), force: z.boolean().optional() }), execute: async (a) => this.paymentTools.deletePaymentMethod(ctx, a) }),
            // ── Tax ──
            getTaxRates: tool({ description: 'List tax rates.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.taxTools.getTaxRates(ctx, a) }),
            getTaxCategories: tool({ description: 'List tax categories.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.taxTools.getTaxCategories(ctx, a) }),
            getZones: tool({ description: 'List zones with member countries.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.taxTools.getZones(ctx, a) }),
            createTaxCategory: tool({ description: 'Create a tax category.', inputSchema: z.object({ name: z.string(), isDefault: z.boolean().optional() }), execute: async (a) => this.taxTools.createTaxCategory(ctx, a) }),
            updateTaxCategory: tool({ description: 'Update a tax category.', inputSchema: z.object({ taxCategoryId: z.string(), name: z.string().optional(), isDefault: z.boolean().optional() }), execute: async (a) => this.taxTools.updateTaxCategory(ctx, a) }),
            deleteTaxCategory: tool({ description: 'Delete a tax category.', inputSchema: z.object({ taxCategoryId: z.string() }), execute: async (a) => this.taxTools.deleteTaxCategory(ctx, a) }),
            createTaxRate: tool({ description: 'Create a tax rate. Value is percentage (e.g. 20 for 20%).', inputSchema: z.object({ name: z.string(), value: z.number(), enabled: z.boolean().optional(), categoryId: z.string(), zoneId: z.string(), customerGroupId: z.string().optional() }), execute: async (a) => this.taxTools.createTaxRate(ctx, a) }),
            updateTaxRate: tool({ description: 'Update a tax rate.', inputSchema: z.object({ taxRateId: z.string(), name: z.string().optional(), value: z.number().optional(), enabled: z.boolean().optional() }), execute: async (a) => this.taxTools.updateTaxRate(ctx, a) }),
            deleteTaxRate: tool({ description: 'Delete a tax rate.', inputSchema: z.object({ taxRateId: z.string() }), execute: async (a) => this.taxTools.deleteTaxRate(ctx, a) }),
            createZone: tool({ description: 'Create a zone with optional country member IDs.', inputSchema: z.object({ name: z.string(), memberIds: z.array(z.string()).optional() }), execute: async (a) => this.taxTools.createZone(ctx, a) }),
            updateZone: tool({ description: 'Update a zone name.', inputSchema: z.object({ zoneId: z.string(), name: z.string().optional() }), execute: async (a) => this.taxTools.updateZone(ctx, a) }),
            deleteZone: tool({ description: 'Delete a zone.', inputSchema: z.object({ zoneId: z.string() }), execute: async (a) => this.taxTools.deleteZone(ctx, a) }),
            addMembersToZone: tool({ description: 'Add countries to a zone.', inputSchema: z.object({ zoneId: z.string(), memberIds: z.array(z.string()) }), execute: async (a) => this.taxTools.addMembersToZone(ctx, a) }),
            removeMembersFromZone: tool({ description: 'Remove countries from a zone.', inputSchema: z.object({ zoneId: z.string(), memberIds: z.array(z.string()) }), execute: async (a) => this.taxTools.removeMembersFromZone(ctx, a) }),
            // ── Countries ──
            getCountries: tool({ description: 'List countries.', inputSchema: z.object({ query: z.string().optional(), enabledOnly: z.boolean().optional(), take: z.number().optional() }), execute: async (a) => this.countryTools.getCountries(ctx, a) }),
            createCountry: tool({ description: 'Create a country with ISO code.', inputSchema: z.object({ code: z.string().describe('ISO 2-letter code'), name: z.string(), enabled: z.boolean().optional() }), execute: async (a) => this.countryTools.createCountry(ctx, a) }),
            updateCountry: tool({ description: 'Update a country.', inputSchema: z.object({ countryId: z.string(), name: z.string().optional(), code: z.string().optional(), enabled: z.boolean().optional() }), execute: async (a) => this.countryTools.updateCountry(ctx, a) }),
            deleteCountry: tool({ description: 'Delete a country.', inputSchema: z.object({ countryId: z.string() }), execute: async (a) => this.countryTools.deleteCountry(ctx, a) }),
            // ── Administrators & Roles ──
            getAdministrators: tool({ description: 'List admin users.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.staffTools.getAdministrators(ctx, a) }),
            getRoles: tool({ description: 'List admin roles with permissions.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.staffTools.getRoles(ctx, a) }),
            createAdministrator: tool({ description: 'Create a new admin user.', inputSchema: z.object({ firstName: z.string(), lastName: z.string(), emailAddress: z.string(), password: z.string(), roleIds: z.array(z.string()) }), execute: async (a) => this.staffTools.createAdministrator(ctx, a) }),
            updateAdministrator: tool({ description: 'Update an admin user.', inputSchema: z.object({ administratorId: z.string(), firstName: z.string().optional(), lastName: z.string().optional(), emailAddress: z.string().optional(), password: z.string().optional(), roleIds: z.array(z.string()).optional() }), execute: async (a) => this.staffTools.updateAdministrator(ctx, a) }),
            deleteAdministrator: tool({ description: 'Soft-delete an admin user.', inputSchema: z.object({ administratorId: z.string() }), execute: async (a) => this.staffTools.deleteAdministrator(ctx, a) }),
            createRole: tool({ description: 'Create a role with permissions. Valid permissions follow the pattern: Read/Create/Update/Delete + Entity (e.g. ReadProduct, CreateOrder, UpdateCustomer, DeleteCollection). Also: SuperAdmin, Authenticated, Owner, Public. Full list includes: ReadProduct, CreateProduct, UpdateProduct, DeleteProduct, ReadOrder, CreateOrder, UpdateOrder, DeleteOrder, ReadCustomer, CreateCustomer, UpdateCustomer, DeleteCustomer, ReadCatalog, CreateCatalog, UpdateCatalog, DeleteCatalog, ReadCollection, CreateCollection, etc.', inputSchema: z.object({ code: z.string(), description: z.string(), permissions: z.array(z.string()).describe('e.g. ["ReadProduct","CreateProduct","ReadOrder","UpdateOrder"]'), channelIds: z.array(z.string()).optional() }), execute: async (a) => this.staffTools.createRole(ctx, a) }),
            updateRole: tool({ description: 'Update a role.', inputSchema: z.object({ roleId: z.string(), code: z.string().optional(), description: z.string().optional(), permissions: z.array(z.string()).optional() }), execute: async (a) => this.staffTools.updateRole(ctx, a) }),
            deleteRole: tool({ description: 'Delete a role.', inputSchema: z.object({ roleId: z.string() }), execute: async (a) => this.staffTools.deleteRole(ctx, a) }),
            // ── Settings, Channels, Sellers ──
            getStoreOverview: tool({ description: 'Get a quick overview of the store: total counts for products, variants, orders, customers, collections, shipping methods, payment methods, tax rates, promotions, facets, and administrators. Use this when the user asks for a store summary or "how many products/customers/orders do we have".', inputSchema: z.object({}), execute: async () => this.settingsTools.getStoreOverview(ctx) }),
            getGlobalSettings: tool({ description: 'Get global store settings.', inputSchema: z.object({}), execute: async () => this.settingsTools.getGlobalSettings(ctx) }),
            updateGlobalSettings: tool({ description: 'Update global settings like inventory tracking.', inputSchema: z.object({ trackInventory: z.boolean().optional(), outOfStockThreshold: z.number().optional(), availableLanguages: z.array(z.string()).optional() }), execute: async (a) => this.settingsTools.updateGlobalSettings(ctx, a) }),
            getChannels: tool({ description: 'List sales channels.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.settingsTools.getChannels(ctx, a) }),
            createChannel: tool({ description: 'Create a sales channel.', inputSchema: z.object({ code: z.string(), token: z.string(), defaultLanguageCode: z.string(), defaultCurrencyCode: z.string(), pricesIncludeTax: z.boolean() }), execute: async (a) => this.settingsTools.createChannel(ctx, a) }),
            updateChannel: tool({ description: 'Update a channel.', inputSchema: z.object({ channelId: z.string(), code: z.string().optional(), defaultLanguageCode: z.string().optional(), defaultCurrencyCode: z.string().optional(), pricesIncludeTax: z.boolean().optional() }), execute: async (a) => this.settingsTools.updateChannel(ctx, a) }),
            deleteChannel: tool({ description: 'Delete a channel.', inputSchema: z.object({ channelId: z.string() }), execute: async (a) => this.settingsTools.deleteChannel(ctx, a) }),
            getSellers: tool({ description: 'List sellers.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.settingsTools.getSellers(ctx, a) }),
            createSeller: tool({ description: 'Create a seller.', inputSchema: z.object({ name: z.string() }), execute: async (a) => this.settingsTools.createSeller(ctx, a) }),
            updateSeller: tool({ description: 'Update a seller.', inputSchema: z.object({ sellerId: z.string(), name: z.string().optional() }), execute: async (a) => this.settingsTools.updateSeller(ctx, a) }),
            deleteSeller: tool({ description: 'Delete a seller.', inputSchema: z.object({ sellerId: z.string() }), execute: async (a) => this.settingsTools.deleteSeller(ctx, a) }),
            // ── Promotions ──
            getPromotions: tool({ description: 'List promotions/discounts.', inputSchema: z.object({ query: z.string().optional(), activeOnly: z.boolean().optional(), take: z.number().optional() }), execute: async (a) => this.promotionTools.getPromotions(ctx, a) }),
            getPromotionConditionsAndActions: tool({ description: 'List all available promotion condition and action codes with their argument formats. ALWAYS call this before creating a promotion to get the correct codes and argument formats.', inputSchema: z.object({}), execute: async () => this.promotionTools.getPromotionConditionsAndActions(ctx) }),
            createPromotion: tool({ description: 'Create a promotion. IMPORTANT: Call getPromotionConditionsAndActions first to get valid codes. Conditions: minimum_order_amount, customer_group, contains_products, at_least_n_with_facets, buy_x_get_y_free. Actions: order_percentage_discount, order_fixed_discount, products_percentage_discount, free_shipping, buy_x_get_y_free. All arg values must be strings.', inputSchema: z.object({ name: z.string(), enabled: z.boolean().optional(), couponCode: z.string().optional(), startsAt: z.string().optional(), endsAt: z.string().optional(), perCustomerUsageLimit: z.number().optional(), usageLimit: z.number().optional(), conditions: z.array(z.object({ code: z.string(), args: z.record(z.string(), z.string()) })).optional(), actions: z.array(z.object({ code: z.string(), args: z.record(z.string(), z.string()) })).optional() }), execute: async (a) => this.promotionTools.createPromotion(ctx, a) }),
            updatePromotion: tool({ description: 'Update a promotion.', inputSchema: z.object({ promotionId: z.string(), name: z.string().optional(), enabled: z.boolean().optional(), couponCode: z.string().optional() }), execute: async (a) => this.promotionTools.updatePromotion(ctx, a) }),
            deletePromotion: tool({ description: 'Soft-delete a promotion.', inputSchema: z.object({ promotionId: z.string() }), execute: async (a) => this.promotionTools.deletePromotion(ctx, a) }),
            // ── Assets ──
            getAssets: tool({ description: 'List assets (images, files). Filter by name or tags.', inputSchema: z.object({ query: z.string().optional(), tags: z.array(z.string()).optional(), take: z.number().optional() }), execute: async (a) => this.assetTools.getAssets(ctx, a) }),
            deleteAsset: tool({ description: 'Delete an asset. Use force=true to delete even if assigned.', inputSchema: z.object({ assetId: z.string(), force: z.boolean().optional() }), execute: async (a) => this.assetTools.deleteAsset(ctx, a) }),
            // ── Customer Groups ──
            getCustomerGroups: tool({ description: 'List customer groups with member counts.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.customerGroupTools.getCustomerGroups(ctx, a) }),
            createCustomerGroup: tool({ description: 'Create a customer group.', inputSchema: z.object({ name: z.string(), customerIds: z.array(z.string()).optional() }), execute: async (a) => this.customerGroupTools.createCustomerGroup(ctx, a) }),
            updateCustomerGroup: tool({ description: 'Rename a customer group.', inputSchema: z.object({ customerGroupId: z.string(), name: z.string().optional() }), execute: async (a) => this.customerGroupTools.updateCustomerGroup(ctx, a) }),
            deleteCustomerGroup: tool({ description: 'Delete a customer group.', inputSchema: z.object({ customerGroupId: z.string() }), execute: async (a) => this.customerGroupTools.deleteCustomerGroup(ctx, a) }),
            addCustomersToGroup: tool({ description: 'Add customers to a group.', inputSchema: z.object({ customerGroupId: z.string(), customerIds: z.array(z.string()) }), execute: async (a) => this.customerGroupTools.addCustomersToGroup(ctx, a) }),
            removeCustomersFromGroup: tool({ description: 'Remove customers from a group.', inputSchema: z.object({ customerGroupId: z.string(), customerIds: z.array(z.string()) }), execute: async (a) => this.customerGroupTools.removeCustomersFromGroup(ctx, a) }),
            // ── Stock Locations ──
            getStockLocations: tool({ description: 'List stock/warehouse locations.', inputSchema: z.object({ query: z.string().optional(), take: z.number().optional() }), execute: async (a) => this.stockLocationTools.getStockLocations(ctx, a) }),
            createStockLocation: tool({ description: 'Create a stock location.', inputSchema: z.object({ name: z.string(), description: z.string().optional() }), execute: async (a) => this.stockLocationTools.createStockLocation(ctx, a) }),
            updateStockLocation: tool({ description: 'Update a stock location.', inputSchema: z.object({ stockLocationId: z.string(), name: z.string().optional(), description: z.string().optional() }), execute: async (a) => this.stockLocationTools.updateStockLocation(ctx, a) }),
            deleteStockLocation: tool({ description: 'Delete a stock location. Optionally transfer stock to another location.', inputSchema: z.object({ stockLocationId: z.string(), transferToLocationId: z.string().optional() }), execute: async (a) => this.stockLocationTools.deleteStockLocation(ctx, a) }),
            // ── Navigation ──
            navigateToPage: tool({
                description: `Navigate the admin user to a dashboard page. Use this when the user asks to "go to", "open", "show me", "take me to", or "navigate to" a page.
IMPORTANT: Paths must NOT include /dashboard prefix. All routes are relative, flat paths.
Available pages:
- / — Dashboard home
- /products — Products list
- /products/{id} — Product detail (need product ID)
- /orders — Orders list
- /orders/{id} — Order detail (need order ID)
- /customers — Customers list
- /customers/{id} — Customer detail (need customer ID)
- /collections — Collections list
- /facets — Facets list
- /assets — Assets list
- /option-groups — Option groups
- /promotions — Promotions list
- /shipping-methods — Shipping methods
- /payment-methods — Payment methods
- /tax-categories — Tax categories
- /tax-rates — Tax rates
- /zones — Zones
- /countries — Countries
- /channels — Channels
- /administrators — Administrators
- /roles — Roles
- /global-settings — Global settings
- /sellers — Sellers
- /stock-locations — Stock locations
- /customer-groups — Customer groups
- /extensions/pages — Page Builder
- /extensions/ai-chat — AI Chat (full view)
- /extensions/ai-dashboard — AI Dashboard
If the user asks to go to a specific entity (e.g. "go to product Laptop"), first search for it to get the ID, then navigate to /products/{id}.`,
                inputSchema: z.object({
                    path: z.string().describe('The relative path to navigate to, e.g. /products — do NOT include /dashboard prefix'),
                    reason: z.string().optional().describe('Brief reason for navigating'),
                }),
                execute: async (a) => ({ navigateTo: a.path, reason: a.reason ?? 'Navigating as requested' }),
            }),
        };
    }

    async chat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        currentPage?: string,
    ): Promise<AdminChatResult> {
        let systemPrompt = ADMIN_SYSTEM_PROMPT;
        const page = sanitizeDashboardPath(currentPage);
        if (page) {
            systemPrompt += `\n\n## Current context\nThe admin user is currently viewing the dashboard page: ${page}`;
        }

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        // Only offer tools the administrator is permitted to use in the active channel.
        const tools = restrictAdminTools(ctx, this.buildTools(ctx));

        // Try OpenAI first, fall back to Azure if available
        try {
            return await this.runChat(this.openai(this.options.chatModel ?? 'gpt-4o-mini'), messages, tools);
        } catch (primaryError) {
            this.logger.error(`Primary OpenAI failed: ${primaryError}`);
            if (this.azure) {
                this.logger.log('Falling back to Azure OpenAI...');
                try {
                    return await this.runChat(this.azure(this.azureDeploymentName), messages, tools);
                } catch (fallbackError) {
                    this.logger.error(`Azure fallback also failed: ${fallbackError}`);
                    throw fallbackError;
                }
            }
            throw primaryError;
        }
    }

    private async runChat(
        model: any,
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        tools: ToolSet,
    ): Promise<AdminChatResult> {
        const result = streamText({
            model,
            messages,
            tools,
            stopWhen: stepCountIs(5),
            temperature: 0.7,
            maxOutputTokens: 2048,
            onStepFinish: (step) => {
                if (step.toolResults && step.toolResults.length > 0) {
                    for (const tr of step.toolResults) {
                        this.logger.log(`Admin tool "${tr.toolName}" completed`);
                    }
                }
            },
            onError: (event) => {
                this.logger.error(`Admin chat streamText error: ${event.error}`);
            },
        });

        const [text, steps, usage] = await Promise.all([result.text, result.steps, result.usage]);

        let allProducts: AiChatProduct[] = [];
        let allCollections: AiChatCollection[] = [];
        let allOrders: AiChatOrder[] = [];
        let navigateTo: string | undefined;

        for (const step of steps) {
            for (const toolResult of step.toolResults) {
                const data = (toolResult as any).output ?? (toolResult as any).result;
                if (!data) continue;
                if (data.products?.length > 0) {
                    allProducts = this.mapper.mergeProducts(allProducts, data.products);
                }
                if (data.collections?.length > 0) {
                    allCollections = this.mapper.mergeCollections(allCollections, data.collections);
                }
                if (data.orders?.length > 0) {
                    allOrders = data.orders;
                }
                if (data.navigateTo) {
                    navigateTo = data.navigateTo;
                }
            }
        }

        return {
            message: text,
            products: allProducts.slice(0, MAX_CHAT_PRODUCTS),
            collections: allCollections.slice(0, 5),
            orders: allOrders.length > 0 ? allOrders : undefined,
            navigateTo,
            usage: {
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
                totalTokens: usage.totalTokens ?? 0,
            },
        };
    }
}

/**
 * `currentPage` comes from the client and is placed in the system prompt, so only accept
 * something that looks like a dashboard route.
 */
function sanitizeDashboardPath(path: string | undefined): string | undefined {
    if (!path) {
        return undefined;
    }
    const trimmed = path.trim().slice(0, 200);
    return /^\/[A-Za-z0-9/_\-.$?=&%]*$/.test(trimmed) ? trimmed : undefined;
}
