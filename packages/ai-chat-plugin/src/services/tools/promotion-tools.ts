import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, OrderService, Order, isGraphQlErrorResult } from '@vendure/core';
import { formatPrice } from '../../constants';
import type { ToolResult, AiPromotion, ApplyCouponAction } from '../types';

export class PromotionTools {
    private readonly logger = new Logger(PromotionTools.name);

    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
    ) {}

    /**
     * Get all currently active promotions available to the customer.
     * Shows coupon-based and automatic promotions with their conditions and discounts.
     */
    async getAvailablePromotions(
        ctx: RequestContext,
    ): Promise<ToolResult> {
        try {
            // Query active promotions that haven't expired.
            // Conditions and actions are stored as simple-json columns directly on the promotion table.
            // Use NOW() directly in SQL so PostgreSQL handles timezone comparison natively
            // instead of passing a JS-generated ISO string which can cause timezone mismatches.
            const result = await this.connection.rawConnection.query(
                `SELECT p.id, p."couponCode", p."perCustomerUsageLimit", p."usageLimit",
                        p."startsAt", p."endsAt", p.enabled,
                        p.conditions, p.actions,
                        t.name, t.description
                 FROM promotion p
                 JOIN promotion_translation t ON t."baseId" = p.id
                 WHERE p.enabled = true
                   AND p."deletedAt" IS NULL
                   AND (p."startsAt" IS NULL OR p."startsAt" <= NOW())
                   AND (p."endsAt" IS NULL OR p."endsAt" >= NOW())
                 ORDER BY p.id ASC`,
            );

            this.logger.debug(`getAvailablePromotions: query returned ${(result as any[]).length} rows`);

            const promotions: AiPromotion[] = [];
            for (const row of result as any[]) {
                const promo: AiPromotion = {
                    id: String(row.id),
                    name: String(row.name ?? ''),
                    description: String(row.description ?? ''),
                    couponCode: row.couponCode ? String(row.couponCode) : undefined,
                    startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : undefined,
                    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : undefined,
                    perCustomerUsageLimit: row.perCustomerUsageLimit ? Number(row.perCustomerUsageLimit) : undefined,
                };

                // Parse conditions from the simple-json column
                const conditions = this.parseJsonColumn(row.conditions);
                const conditionDetails: string[] = [];
                for (const c of conditions) {
                    const parsed = this.parseCondition(c.code ?? c.type, c.args);
                    if (parsed) conditionDetails.push(parsed);
                }
                if (conditionDetails.length > 0) {
                    promo.conditions = conditionDetails;
                }

                // Parse actions from the simple-json column
                const actions = this.parseJsonColumn(row.actions);
                const actionDetails: string[] = [];
                for (const a of actions) {
                    const parsed = this.parseAction(a.code ?? a.type, a.args);
                    if (parsed) actionDetails.push(parsed);
                }
                if (actionDetails.length > 0) {
                    promo.discountSummary = actionDetails.join('; ');
                }

                promotions.push(promo);
            }

            const couponPromos = promotions.filter(p => p.couponCode);
            const autoPromos = promotions.filter(p => !p.couponCode);

            let summary = '';
            if (promotions.length === 0) {
                summary = 'No active promotions available at this time.';
            } else {
                const parts: string[] = [];
                if (autoPromos.length > 0) {
                    parts.push(`Automatic promotions (applied automatically): ${autoPromos.map(p =>
                        `"${p.name}"${p.discountSummary ? ' — ' + p.discountSummary : ''}${p.conditions?.length ? ' (requires: ' + p.conditions.join(', ') + ')' : ''}`,
                    ).join('; ')}`);
                }
                if (couponPromos.length > 0) {
                    parts.push(`Coupon promotions (need a coupon code): ${couponPromos.map(p =>
                        `"${p.name}" — code: "${p.couponCode}"${p.discountSummary ? ', discount: ' + p.discountSummary : ''}${p.conditions?.length ? ' (requires: ' + p.conditions.join(', ') + ')' : ''}${p.endsAt ? ', expires: ' + new Date(p.endsAt).toLocaleDateString() : ''}`,
                    ).join('; ')}`);
                }
                summary = parts.join('. ');
            }

            return {
                products: [],
                collections: [],
                promotions,
                summary,
            };
        } catch (e) {
            this.logger.error(`Error fetching promotions: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching available promotions.' };
        }
    }

    /**
     * Apply a coupon code to the customer's active order.
     */
    async applyCouponCode(
        ctx: RequestContext,
        params: { couponCode: string },
    ): Promise<ToolResult> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to apply a coupon code.' };
        }

        const couponCode = params.couponCode?.trim();
        if (!couponCode) {
            return { products: [], collections: [], summary: 'Error: No coupon code provided.' };
        }

        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found. Add items to your cart first.' };
            }

            const result = await this.orderService.applyCouponCode(ctx, order.id, couponCode);

            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? (result as any).errorCode ?? 'Unknown error';
                this.logger.warn(`applyCouponCode error: ${errorMsg}`);

                // Provide a user-friendly message
                if (errorMsg.includes('COUPON_CODE_INVALID') || errorMsg.toLowerCase().includes('invalid')) {
                    return { products: [], collections: [], summary: `The coupon code "${couponCode}" is not valid. Please check the code and try again.` };
                }
                if (errorMsg.includes('COUPON_CODE_EXPIRED') || errorMsg.toLowerCase().includes('expired')) {
                    return { products: [], collections: [], summary: `The coupon code "${couponCode}" has expired.` };
                }
                if (errorMsg.includes('COUPON_CODE_LIMIT_ERROR') || errorMsg.toLowerCase().includes('limit')) {
                    return { products: [], collections: [], summary: `The coupon code "${couponCode}" has reached its usage limit.` };
                }
                return { products: [], collections: [], summary: `Error applying coupon code: ${errorMsg}` };
            }

            // Get the updated order to show the new total
            const updatedOrder = result as Order;
            const totalBefore = (order as any).totalWithTax ?? 0;
            const totalAfter = (updatedOrder as any).totalWithTax ?? 0;
            const discount = totalBefore - totalAfter;

            let summaryText = `Coupon code "${couponCode}" applied successfully!`;
            if (discount > 0) {
                summaryText += ` You saved ${formatPrice(discount)}. New order total: ${formatPrice(totalAfter)}.`;
            } else {
                summaryText += ` Order total: ${formatPrice(totalAfter)}.`;
            }

            return {
                products: [],
                collections: [],
                summary: summaryText,
                applyCouponAction: { couponCode, applied: true },
            };
        } catch (e) {
            this.logger.error(`Error applying coupon code: ${e}`);
            return { products: [], collections: [], summary: 'Error applying coupon code. Please try again.' };
        }
    }

    /**
     * Remove a coupon code from the customer's active order.
     */
    async removeCouponCode(
        ctx: RequestContext,
        params: { couponCode: string },
    ): Promise<ToolResult> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to remove a coupon code.' };
        }

        const couponCode = params.couponCode?.trim();
        if (!couponCode) {
            return { products: [], collections: [], summary: 'Error: No coupon code provided.' };
        }

        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found.' };
            }

            const result = await this.orderService.removeCouponCode(ctx, order.id, couponCode);

            // removeCouponCode returns the updated Order (not an error result)
            if (!result) {
                return { products: [], collections: [], summary: `Could not remove coupon code "${couponCode}". It may not be applied to your order.` };
            }

            const totalAfter = (result as any).totalWithTax ?? 0;
            return {
                products: [],
                collections: [],
                summary: `Coupon code "${couponCode}" removed. Updated order total: ${formatPrice(totalAfter)}.`,
                applyCouponAction: { couponCode, applied: false },
            };
        } catch (e) {
            this.logger.error(`Error removing coupon code: ${e}`);
            return { products: [], collections: [], summary: 'Error removing coupon code. Please try again.' };
        }
    }

    /**
     * Get the current discounts/promotions applied to the active order,
     * including how much more the customer needs to spend to qualify for other promotions.
     */
    async getCartDiscounts(
        ctx: RequestContext,
    ): Promise<ToolResult> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to view cart discounts.' };
        }

        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'No active order found. Add items to your cart first.' };
            }

            // Load full order with discounts
            const fullOrder = await this.connection.rawConnection.query(
                `SELECT o.id, o.code, o."subTotalWithTax", o."totalWithTax",
                        o."couponCodes"
                 FROM "order" o
                 WHERE o.id = $1`,
                [order.id],
            );

            if (!fullOrder || fullOrder.length === 0) {
                return { products: [], collections: [], summary: 'Could not load order details.' };
            }

            const orderData = fullOrder[0];
            const subTotal = Number(orderData.subTotalWithTax ?? 0);
            const total = Number(orderData.totalWithTax ?? 0);
            const discount = subTotal - total;
            const couponCodes: string[] = orderData.couponCodes
                ? (typeof orderData.couponCodes === 'string' ? JSON.parse(orderData.couponCodes) : orderData.couponCodes)
                : [];

            // Check which promotions customer could still qualify for
            const allPromotions = await this.connection.rawConnection.query(
                `SELECT p.id, p."couponCode", p.conditions,
                        t.name, t.description
                 FROM promotion p
                 JOIN promotion_translation t ON t."baseId" = p.id
                 WHERE p.enabled = true
                   AND p."deletedAt" IS NULL
                   AND (p."startsAt" IS NULL OR p."startsAt" <= NOW())
                   AND (p."endsAt" IS NULL OR p."endsAt" >= NOW())`,
            );

            // Check for minimum order amount conditions
            const nearbyPromotions: string[] = [];
            for (const promo of allPromotions as any[]) {
                const conditions = this.parseJsonColumn(promo.conditions);
                for (const c of conditions) {
                    const code = c.code ?? c.type;
                    if (code === 'minimum_order_amount' || code === 'minimumOrderAmount') {
                        const minAmount = this.extractAmountFromArgs(c.args);
                        if (minAmount && subTotal < minAmount) {
                            const remaining = minAmount - subTotal;
                            nearbyPromotions.push(
                                `"${promo.name}" — spend ${formatPrice(remaining)} more to qualify${promo.couponCode ? ` (use code: "${promo.couponCode}")` : ' (applied automatically)'}`,
                            );
                        }
                    }
                }
            }

            // Build summary
            const parts: string[] = [];
            parts.push(`Cart subtotal: ${formatPrice(subTotal)}, total: ${formatPrice(total)}.`);

            if (couponCodes.length > 0) {
                parts.push(`Applied coupon codes: ${couponCodes.map((c: string) => `"${c}"`).join(', ')}.`);
            }

            if (discount > 0) {
                parts.push(`Total discount: ${formatPrice(discount)}.`);
            } else {
                parts.push('No discounts currently applied.');
            }

            if (nearbyPromotions.length > 0) {
                parts.push(`Promotions you're close to qualifying for: ${nearbyPromotions.join('; ')}`);
            }

            return {
                products: [],
                collections: [],
                summary: parts.join(' '),
            };
        } catch (e) {
            this.logger.error(`Error fetching cart discounts: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching cart discount information.' };
        }
    }

    // ── Helper methods ──

    /**
     * Parse a simple-json column value into an array.
     * Vendure stores conditions/actions as JSON arrays in the promotion table.
     * Each entry has { code, args } where args is an array of { name, value } pairs.
     */
    private parseJsonColumn(value: unknown): Array<{ code?: string; type?: string; args?: unknown }> {
        try {
            if (!value) return [];
            if (Array.isArray(value)) return value;
            if (typeof value === 'string') {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            }
            return [];
        } catch {
            return [];
        }
    }

    private parseCondition(code: string | undefined, argsRaw: unknown): string | null {
        if (!code) return null;
        try {
            const args = this.normalizeArgs(argsRaw);
            const argsMap = new Map(args.map((a: any) => [a.name, a.value]));

            switch (code) {
                case 'minimum_order_amount':
                case 'minimumOrderAmount': {
                    const amount = this.extractAmountFromArgs(argsRaw);
                    return amount ? `Minimum order of ${formatPrice(amount)}` : 'Minimum order amount required';
                }
                case 'at_least_n_with_facets':
                case 'atLeastNWithFacets': {
                    const minimum = argsMap.get('minimum') ?? argsMap.get('count');
                    return minimum ? `At least ${minimum} qualifying items` : 'Specific items required';
                }
                case 'buy_x_get_y_free':
                case 'buyXGetYFree': {
                    const amountX = argsMap.get('amountX');
                    const amountY = argsMap.get('amountY');
                    return amountX && amountY ? `Buy ${amountX} get ${amountY} free` : 'Buy X get Y free';
                }
                case 'customer_group':
                case 'customerGroup':
                    return 'Available to specific customer groups';
                default:
                    return null;
            }
        } catch {
            return null;
        }
    }

    private parseAction(code: string | undefined, argsRaw: unknown): string | null {
        if (!code) return null;
        try {
            const args = this.normalizeArgs(argsRaw);
            const argsMap = new Map(args.map((a: any) => [a.name, a.value]));

            switch (code) {
                case 'order_percentage_discount':
                case 'orderPercentageDiscount': {
                    const discount = argsMap.get('discount');
                    return discount ? `${discount}% off entire order` : 'Percentage discount on order';
                }
                case 'order_fixed_discount':
                case 'orderFixedDiscount': {
                    const discount = argsMap.get('discount');
                    return discount ? `${formatPrice(Number(discount))} off entire order` : 'Fixed discount on order';
                }
                case 'facet_based_discount':
                case 'discountOnItemWithFacets': {
                    const discount = argsMap.get('discount');
                    return discount ? `${discount}% off qualifying items` : 'Discount on qualifying items';
                }
                case 'products_percentage_discount':
                case 'productsPercentageDiscount': {
                    const discount = argsMap.get('discount');
                    return discount ? `${discount}% off specific products` : 'Percentage discount on products';
                }
                case 'free_shipping':
                case 'freeShipping':
                    return 'Free shipping';
                case 'buy_x_get_y_free':
                case 'buyXGetYFree':
                    return 'Buy X get Y free';
                default:
                    return null;
            }
        } catch {
            return null;
        }
    }

    /**
     * Normalize args from Vendure's condition/action format.
     * Args can be:
     * - An array of { name, value } objects
     * - A JSON string of such an array
     * - An object with { argName: value } pairs
     */
    private normalizeArgs(argsRaw: unknown): Array<{ name: string; value: unknown }> {
        try {
            if (!argsRaw) return [];
            const args = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw;
            if (Array.isArray(args)) return args;
            // Handle { key: value } format
            if (typeof args === 'object') {
                return Object.entries(args).map(([name, value]) => ({ name, value }));
            }
            return [];
        } catch {
            return [];
        }
    }

    private extractAmountFromArgs(argsRaw: unknown): number | null {
        try {
            const args = this.normalizeArgs(argsRaw);
            for (const a of args) {
                if (a.name === 'amount' || a.name === 'orderMinimum' || a.name === 'minimum') {
                    const val = Number(a.value);
                    if (!isNaN(val) && val > 0) return val;
                }
            }
            return null;
        } catch {
            return null;
        }
    }
}
