import { Permission, RequestContext } from '@vendure/core';
import type { ToolSet } from 'ai';

type P = keyof typeof Permission;

/** Catalog entities accept the broad Catalog permission or the fine-grained one, like the Admin API. */
const catalog = (verb: 'Read' | 'Create' | 'Update' | 'Delete', entity: string): P[] => [`${verb}Catalog` as P, `${verb}${entity}` as P];
const settings = (verb: 'Read' | 'Create' | 'Update' | 'Delete', entity: string): P[] => [`${verb}Settings` as P, `${verb}${entity}` as P];

/**
 * The permission(s) an administrator needs, in the active channel, to use each admin tool.
 * Mirrors the `@Allow()` of the equivalent Admin API operation; any one of the listed
 * permissions is sufficient. Tools missing from this map are denied (fail closed).
 */
export const ADMIN_TOOL_PERMISSIONS: Record<string, P[]> = {
    // Products
    searchProducts: catalog('Read', 'Product'),
    vectorSearch: catalog('Read', 'Product'),
    getProductDetails: catalog('Read', 'Product'),
    createProduct: catalog('Create', 'Product'),
    createProductWithVariants: catalog('Create', 'Product'),
    updateProduct: catalog('Update', 'Product'),
    updateProductVariant: catalog('Update', 'Product'),
    deleteProduct: catalog('Delete', 'Product'),
    deleteProductVariant: catalog('Delete', 'Product'),
    // Orders
    searchOrders: ['ReadOrder'],
    getOrderDetails: ['ReadOrder'],
    // Customers
    searchCustomers: ['ReadCustomer'],
    getCustomerDetails: ['ReadCustomer'],
    createCustomer: ['CreateCustomer'],
    updateCustomer: ['UpdateCustomer'],
    createCustomerAddress: ['UpdateCustomer'],
    addNoteToCustomer: ['UpdateCustomer'],
    deleteCustomer: ['DeleteCustomer'],
    // Collections
    getCollections: catalog('Read', 'Collection'),
    createCollection: catalog('Create', 'Collection'),
    updateCollection: catalog('Update', 'Collection'),
    moveCollection: catalog('Update', 'Collection'),
    deleteCollection: catalog('Delete', 'Collection'),
    // Facets
    getFacets: catalog('Read', 'Facet'),
    getFacetValues: catalog('Read', 'Facet'),
    createFacet: catalog('Create', 'Facet'),
    createFacetValues: catalog('Create', 'Facet'),
    updateFacet: catalog('Update', 'Facet'),
    updateFacetValue: catalog('Update', 'Facet'),
    deleteFacet: catalog('Delete', 'Facet'),
    deleteFacetValues: catalog('Delete', 'Facet'),
    // Shipping & payment
    getShippingMethods: settings('Read', 'ShippingMethod'),
    createShippingMethod: settings('Create', 'ShippingMethod'),
    updateShippingMethod: settings('Update', 'ShippingMethod'),
    deleteShippingMethod: settings('Delete', 'ShippingMethod'),
    getPaymentMethods: settings('Read', 'PaymentMethod'),
    createPaymentMethod: settings('Create', 'PaymentMethod'),
    updatePaymentMethod: settings('Update', 'PaymentMethod'),
    deletePaymentMethod: settings('Delete', 'PaymentMethod'),
    // Tax & zones
    getTaxRates: settings('Read', 'TaxRate'),
    createTaxRate: settings('Create', 'TaxRate'),
    updateTaxRate: settings('Update', 'TaxRate'),
    deleteTaxRate: settings('Delete', 'TaxRate'),
    getTaxCategories: settings('Read', 'TaxCategory'),
    createTaxCategory: settings('Create', 'TaxCategory'),
    updateTaxCategory: settings('Update', 'TaxCategory'),
    deleteTaxCategory: settings('Delete', 'TaxCategory'),
    getZones: settings('Read', 'Zone'),
    createZone: settings('Create', 'Zone'),
    updateZone: settings('Update', 'Zone'),
    addMembersToZone: settings('Update', 'Zone'),
    removeMembersFromZone: settings('Update', 'Zone'),
    deleteZone: settings('Delete', 'Zone'),
    // Countries
    getCountries: settings('Read', 'Country'),
    createCountry: settings('Create', 'Country'),
    updateCountry: settings('Update', 'Country'),
    deleteCountry: settings('Delete', 'Country'),
    // Staff (roles are managed with Administrator permissions in the Admin API)
    getAdministrators: ['ReadAdministrator'],
    getRoles: ['ReadAdministrator'],
    createAdministrator: ['CreateAdministrator'],
    createRole: ['CreateAdministrator'],
    updateAdministrator: ['UpdateAdministrator'],
    updateRole: ['UpdateAdministrator'],
    deleteAdministrator: ['DeleteAdministrator'],
    deleteRole: ['DeleteAdministrator'],
    // Settings & channels
    getStoreOverview: ['ReadSettings'],
    getGlobalSettings: ['ReadSettings'],
    updateGlobalSettings: ['UpdateSettings', 'UpdateGlobalSettings'],
    getChannels: settings('Read', 'Channel'),
    createChannel: ['CreateChannel'],
    updateChannel: settings('Update', 'Channel'),
    deleteChannel: ['DeleteChannel'],
    getSellers: settings('Read', 'Seller'),
    createSeller: settings('Create', 'Seller'),
    updateSeller: settings('Update', 'Seller'),
    deleteSeller: settings('Delete', 'Seller'),
    // Promotions
    getPromotions: ['ReadPromotion'],
    getPromotionConditionsAndActions: ['ReadPromotion'],
    createPromotion: ['CreatePromotion'],
    updatePromotion: ['UpdatePromotion'],
    deletePromotion: ['DeletePromotion'],
    // Assets
    getAssets: catalog('Read', 'Asset'),
    deleteAsset: catalog('Delete', 'Asset'),
    // Customer groups
    getCustomerGroups: ['ReadCustomerGroup', 'ReadCustomer'],
    createCustomerGroup: ['CreateCustomerGroup'],
    updateCustomerGroup: ['UpdateCustomerGroup'],
    addCustomersToGroup: ['UpdateCustomerGroup'],
    removeCustomersFromGroup: ['UpdateCustomerGroup'],
    deleteCustomerGroup: ['DeleteCustomerGroup'],
    // Stock locations
    getStockLocations: ['ReadStockLocation'],
    createStockLocation: ['CreateStockLocation'],
    updateStockLocation: ['UpdateStockLocation'],
    deleteStockLocation: ['DeleteStockLocation'],
    // UI only: navigates the dashboard, touches no data
    navigateToPage: [],
};

/**
 * Admin tools that are never executed straight from the model: they are destructive, or
 * change who can do what (staff, roles, channels, settings, payment). The model can only
 * request them; a human must press Confirm in the dashboard. Override with the
 * `adminToolsRequiringConfirmation` plugin option.
 */
export const DEFAULT_ADMIN_TOOLS_REQUIRING_CONFIRMATION: string[] = [
    ...Object.keys(ADMIN_TOOL_PERMISSIONS).filter(name => name.startsWith('delete')),
    'removeMembersFromZone',
    'removeCustomersFromGroup',
    'createAdministrator',
    'updateAdministrator',
    'createRole',
    'updateRole',
    'updateGlobalSettings',
    'createChannel',
    'updateChannel',
    'createPaymentMethod',
    'updatePaymentMethod',
];

export interface RestrictAdminToolsOptions {
    /** Tool names that must be confirmed by a human before they run. */
    requiresConfirmation?: (toolName: string) => boolean;
    /** Called instead of executing a tool that requires confirmation; its result goes to the model. */
    onConfirmationRequired?: (toolName: string, input: Record<string, unknown>) => Promise<unknown>;
    /** Runs non-confirmation write tools (e.g. inside a transaction) instead of executing them directly. */
    runWrite?: (toolName: string, input: unknown, executeOptions: unknown) => Promise<unknown>;
    isWrite?: (toolName: string) => boolean;
}

export function canUseAdminTool(ctx: RequestContext, toolName: string): boolean {
    const required = ADMIN_TOOL_PERMISSIONS[toolName];
    if (!required) {
        return false;
    }
    if (required.length === 0) {
        return true;
    }
    return ctx.userHasPermissions(required.map(p => Permission[p]).filter(Boolean));
}

/**
 * Returns only the tools the administrator may use in the active channel, each wrapped so
 * the permission is re-checked when executed. Hidden tools are never offered to the model.
 */
export function restrictAdminTools(ctx: RequestContext, tools: ToolSet, restrictOptions: RestrictAdminToolsOptions = {}): ToolSet {
    const allowed: ToolSet = {};
    for (const [name, definition] of Object.entries(tools)) {
        if (!canUseAdminTool(ctx, name)) {
            continue;
        }
        const execute = (definition as any).execute;
        const needsConfirmation = !!restrictOptions.requiresConfirmation?.(name);
        allowed[name] = {
            ...definition,
            ...(needsConfirmation
                ? {
                      description:
                          `${(definition as any).description ?? ''} ` +
                          'Calling this does NOT perform the action: it shows the administrator a Confirm button. ' +
                          'Call it directly when asked; do not ask for confirmation in text first.',
                  }
                : {}),
            ...(execute
                ? {
                      execute: (input: unknown, executeOptions: unknown) => {
                          if (!canUseAdminTool(ctx, name)) {
                              return { error: 'FORBIDDEN', summary: `You do not have permission to use ${name}.` };
                          }
                          if (restrictOptions.requiresConfirmation?.(name) && restrictOptions.onConfirmationRequired) {
                              return restrictOptions.onConfirmationRequired(name, (input ?? {}) as Record<string, unknown>);
                          }
                          if (restrictOptions.runWrite && restrictOptions.isWrite?.(name)) {
                              return restrictOptions.runWrite(name, input, executeOptions);
                          }
                          return execute(input, executeOptions);
                      },
                  }
                : {}),
        } as any;
    }
    return allowed;
}

/** "deleteProduct", { productId: "5" } → "Delete product (productId: 5)" */
export function describeAdminAction(toolName: string, input: Record<string, unknown>): string {
    const words = toolName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    const label = words.charAt(0).toUpperCase() + words.slice(1);
    const args = Object.entries(input)
        .filter(([key, value]) => value !== undefined && value !== null && !/password/i.test(key))
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .join(', ');
    const text = args ? `${label} (${args})` : label;
    return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}
