import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, OrderService, Order, isGraphQlErrorResult } from '@vendure/core';
import { formatPrice } from '../../constants';
import type { ToolResult, SetShippingAddressAction, SetBillingAddressAction, SetShippingMethodAction } from '../types';
import { ActiveOrderLookup, NO_CART_MESSAGE } from './active-order-lookup';

export class CheckoutTools {
    private readonly logger = new Logger(CheckoutTools.name);

    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private activeOrders: ActiveOrderLookup,
    ) {}

    async getAvailableCountries(
        ctx: RequestContext,
    ): Promise<ToolResult> {
        try {
            const result = await this.connection.rawConnection.query(
                `SELECT r.id, r.code, t.name
                 FROM region r
                 JOIN region_translation t ON t."baseId" = r.id
                 WHERE r.type = 'country' AND r.enabled = true
                 ORDER BY t.name ASC`
            );
            const countries = (result as any[]).map(r => ({
                id: String(r.id),
                code: String(r.code),
                name: String(r.name),
            }));
            return {
                products: [],
                collections: [],
                summary: countries.length > 0
                    ? `Available countries: ${countries.map(c => `${c.name} (${c.code})`).join(', ')}`
                    : 'No countries available.',
            };
        } catch (e) {
            this.logger.error(`Error fetching countries: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching available countries.' };
        }
    }

    async getEligibleShippingMethods(
        ctx: RequestContext,
    ): Promise<ToolResult> {
        try {
            const order = await this.activeOrders.find(ctx);
            if (!order) {
                return { products: [], collections: [], summary: NO_CART_MESSAGE };
            }
            const methods = await this.orderService.getEligibleShippingMethods(ctx, order.id);
            const mapped = methods.map((m: any) => ({
                id: String(m.id),
                name: String(m.name ?? ''),
                code: String(m.code ?? ''),
                description: String(m.description ?? ''),
                priceWithTax: Number(m.priceWithTax ?? m.price ?? 0),
            }));
            return {
                products: [],
                collections: [],
                summary: mapped.length > 0
                    ? `Available shipping methods: ${mapped.map(m => `"${m.name}" (id: ${m.id}, price: ${formatPrice(m.priceWithTax, ctx.currencyCode)}, code: ${m.code})`).join(', ')}`
                    : 'No shipping methods available. Make sure a shipping address is set first.',
            };
        } catch (e) {
            this.logger.error(`Error fetching shipping methods: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching shipping methods. Make sure a shipping address has been set.' };
        }
    }

    async getEligiblePaymentMethods(
        ctx: RequestContext,
    ): Promise<ToolResult> {
        try {
            const order = await this.activeOrders.find(ctx);
            if (!order) {
                return { products: [], collections: [], summary: NO_CART_MESSAGE };
            }
            const methods = await this.orderService.getEligiblePaymentMethods(ctx, order.id);
            const mapped = methods.map((m: any) => ({
                id: String(m.id),
                name: String(m.name ?? ''),
                code: String(m.code ?? ''),
                description: String(m.description ?? ''),
                isEligible: Boolean(m.isEligible),
            }));
            const eligible = mapped.filter(m => m.isEligible);
            return {
                products: [],
                collections: [],
                summary: eligible.length > 0
                    ? `Available payment methods: ${eligible.map(m => `"${m.name}" (code: ${m.code}${m.description ? ', ' + m.description : ''})`).join(', ')}`
                    : 'No payment methods available for this order.',
            };
        } catch (e) {
            this.logger.error(`Error fetching payment methods: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching payment methods.' };
        }
    }

    async setShippingAddress(
        ctx: RequestContext,
        params: {
            fullName: string; streetLine1: string; streetLine2?: string;
            city: string; province: string; postalCode: string;
            countryCode: string; phoneNumber: string; company?: string;
        },
    ): Promise<ToolResult> {
        try {
            const order = await this.activeOrders.find(ctx);
            if (!order) {
                return { products: [], collections: [], summary: NO_CART_MESSAGE };
            }
            // Validate required fields
            const required = ['fullName', 'streetLine1', 'city', 'province', 'postalCode', 'countryCode', 'phoneNumber'] as const;
            for (const field of required) {
                if (!params[field]?.trim()) {
                    return { products: [], collections: [], summary: `Error: Missing required field "${field}" for shipping address.` };
                }
            }
            // Set address via OrderService
            const result = await this.orderService.setShippingAddress(ctx, order.id, {
                fullName: params.fullName,
                streetLine1: params.streetLine1,
                streetLine2: params.streetLine2 ?? '',
                city: params.city,
                province: params.province,
                postalCode: params.postalCode,
                countryCode: params.countryCode,
                phoneNumber: params.phoneNumber,
                company: params.company ?? '',
            });
            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? 'Unknown error';
                return { products: [], collections: [], summary: `Error setting shipping address: ${errorMsg}` };
            }
            return {
                products: [],
                collections: [],
                summary: `Shipping address set successfully for ${params.fullName}, ${params.streetLine1}, ${params.city}, ${params.province} ${params.postalCode}, ${params.countryCode}.`,
                setShippingAddressAction: { ...params },
            };
        } catch (e) {
            this.logger.error(`Error setting shipping address: ${e}`);
            return { products: [], collections: [], summary: 'Error setting shipping address. Please try again.' };
        }
    }

    async setBillingAddress(
        ctx: RequestContext,
        params: {
            fullName: string; streetLine1: string; streetLine2?: string;
            city: string; province: string; postalCode: string;
            countryCode: string; phoneNumber: string; company?: string;
        },
    ): Promise<ToolResult> {
        try {
            const order = await this.activeOrders.find(ctx);
            if (!order) {
                return { products: [], collections: [], summary: NO_CART_MESSAGE };
            }
            const required = ['fullName', 'streetLine1', 'city', 'province', 'postalCode', 'countryCode', 'phoneNumber'] as const;
            for (const field of required) {
                if (!params[field]?.trim()) {
                    return { products: [], collections: [], summary: `Error: Missing required field "${field}" for billing address.` };
                }
            }
            const result = await this.orderService.setBillingAddress(ctx, order.id, {
                fullName: params.fullName,
                streetLine1: params.streetLine1,
                streetLine2: params.streetLine2 ?? '',
                city: params.city,
                province: params.province,
                postalCode: params.postalCode,
                countryCode: params.countryCode,
                phoneNumber: params.phoneNumber,
                company: params.company ?? '',
            });
            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? 'Unknown error';
                return { products: [], collections: [], summary: `Error setting billing address: ${errorMsg}` };
            }
            return {
                products: [],
                collections: [],
                summary: `Billing address set successfully for ${params.fullName}, ${params.streetLine1}, ${params.city}, ${params.province} ${params.postalCode}, ${params.countryCode}.`,
                setBillingAddressAction: { ...params },
            };
        } catch (e) {
            this.logger.error(`Error setting billing address: ${e}`);
            return { products: [], collections: [], summary: 'Error setting billing address. Please try again.' };
        }
    }

    async setShippingMethod(
        ctx: RequestContext,
        params: { shippingMethodId: string },
    ): Promise<ToolResult> {
        try {
            const order = await this.activeOrders.find(ctx);
            if (!order) {
                return { products: [], collections: [], summary: NO_CART_MESSAGE };
            }
            if (!params.shippingMethodId || !/^\d+$/.test(params.shippingMethodId)) {
                return { products: [], collections: [], summary: 'Error: Invalid shippingMethodId. Use getEligibleShippingMethods first to get valid IDs.' };
            }
            const result = await this.orderService.setShippingMethod(ctx, order.id, [params.shippingMethodId]);
            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? 'Unknown error';
                return { products: [], collections: [], summary: `Error setting shipping method: ${errorMsg}` };
            }
            // Get the updated order to show shipping cost
            const updatedOrder = result as Order;
            const shippingCost = (updatedOrder as any).shippingWithTax ?? (updatedOrder as any).shipping ?? 0;
            return {
                products: [],
                collections: [],
                summary: `Shipping method set successfully. Shipping cost: ${formatPrice(shippingCost, ctx.currencyCode)}. Order total: ${formatPrice((updatedOrder as any).totalWithTax ?? 0, ctx.currencyCode)}.`,
                setShippingMethodAction: { shippingMethodId: params.shippingMethodId },
            };
        } catch (e) {
            this.logger.error(`Error setting shipping method: ${e}`);
            return { products: [], collections: [], summary: 'Error setting shipping method. Please try again.' };
        }
    }
}
