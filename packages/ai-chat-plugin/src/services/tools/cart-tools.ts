import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, ProductVariant, OrderService, Order, isGraphQlErrorResult } from '@vendure/core';
import { ChatResultMapper } from '../chat-result-mapper';
import { formatPrice } from '../../constants';
import type { AiChatProduct, AiChatCollection, AiActiveOrder, AddToCartAction, ToolResult } from '../types';

export class CartTools {
    private readonly logger = new Logger(CartTools.name);

    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private mapper: ChatResultMapper,
    ) {}

    async addToCart(
        _ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
        const variantId = String(args.variantId ?? '').trim();
        const quantity = Math.max(1, Number(args.quantity) || 1);
        const productName = args.productName ? String(args.productName) : undefined;

        this.logger.log(`addToCart called with variantId=${variantId}, quantity=${quantity}, productName=${productName}`);

        if (!variantId) {
            return { products: [], collections: [], summary: 'Error: No variantId provided. Search for the product first to get the correct variantId.' };
        }

        // Validate that variantId is a numeric ID, not a fabricated slug, somehow is stupid enough to send slugs sometimess
        if (!/^\d+$/.test(variantId)) {
            return {
                products: [],
                collections: [],
                summary: `Error: Invalid variantId "${variantId}". The variantId must be a numeric ID (e.g. "42") from a previous search result. Please search for the product first to get the correct variantId.`,
            };
        }

        // Verify the variant actually exists and get the real product name
        const variantRepo = this.connection.rawConnection.getRepository(ProductVariant);
        const variant = await variantRepo.findOne({
            where: { id: Number(variantId) },
            relations: ['product', 'product.translations', 'translations'],
        });

        if (!variant) {
            return {
                products: [],
                collections: [],
                summary: `Error: No product variant found with ID ${variantId}. Please search for the product again to get the correct variantId.`,
            };
        }

        const actualProductName = (variant as any).product?.translations?.[0]?.name
            ?? (variant as any).translations?.[0]?.name
            ?? 'item';

        this.logger.log(`addToCart verified: variantId=${variantId} is "${actualProductName}" (variant: ${(variant as any).translations?.[0]?.name ?? variant.id}), LLM said productName="${productName}"`);

        // Safety check: if the LLM provided a productName, verify it roughly matches the actual product
        if (productName && actualProductName !== 'item') {
            const requestedLower = productName.toLowerCase().trim();
            const actualLower = actualProductName.toLowerCase().trim();
            // Check if neither name contains the other (very loose match)
            const isMatch = actualLower.includes(requestedLower)
                || requestedLower.includes(actualLower)
                || actualLower.split(/\s+/).some((w: string) => requestedLower.includes(w))
                || requestedLower.split(/\s+/).some((w: string) => actualLower.includes(w));

            if (!isMatch) {
                this.logger.warn(`addToCart MISMATCH: LLM requested "${productName}" but variantId ${variantId} is "${actualProductName}". Rejecting.`);
                return {
                    products: [],
                    collections: [],
                    summary: `Error: The variantId ${variantId} corresponds to "${actualProductName}", but you are trying to add "${productName}". These don't match. Please search for "${productName}" first to get the correct variantId.`,
                };
            }
        }

        return {
            products: [],
            collections: [],
            summary: `Adding ${quantity}x "${actualProductName}" (variantId: ${variantId}) to cart.`,
            addToCartAction: { variantId, quantity, productName: actualProductName },
        };
    }

    async getActiveOrder(
        ctx: RequestContext,
        _args: Record<string, unknown>,
    ): Promise<ToolResult> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to view your cart.' };
        }

        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);

            if (!order) {
                return { products: [], collections: [], summary: 'Your cart is empty. No active order found.' };
            }

            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const fullOrder = await orderRepo.findOne({
                where: { id: order.id },
                relations: ['lines', 'lines.productVariant', 'lines.productVariant.translations', 'lines.featuredAsset'],
            });

            if (!fullOrder || !fullOrder.lines || fullOrder.lines.length === 0) {
                return { products: [], collections: [], summary: 'Your cart is empty.' };
            }

            const activeOrder = this.mapper.mapActiveOrder(fullOrder);

            const linesSummary = activeOrder.lines
                .map(l => `${l.quantity}x "${l.productName}" (orderLineId: ${l.orderLineId}, variantId: ${l.variantId}, linePrice: ${formatPrice(l.linePriceWithTax)})`)
                .join(', ');

            return {
                products: [],
                collections: [],
                activeOrder,
                summary: `Cart has ${activeOrder.totalQuantity} item(s), total: ${formatPrice(activeOrder.totalWithTax)}. Lines: ${linesSummary}. Use the orderLineId when adjusting quantities.`,
            };
        } catch (e) {
            this.logger.error(`Error fetching active order: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching your cart. Please try again.' };
        }
    }

    async adjustOrderLine(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to modify your cart.' };
        }

        const orderLineId = String(args.orderLineId ?? '').trim();
        const quantity = Number(args.quantity ?? -1);

        if (!orderLineId || !/^\d+$/.test(orderLineId)) {
            return { products: [], collections: [], summary: 'Error: Invalid orderLineId. Use getActiveOrder first to get the correct orderLineId.' };
        }
        if (quantity < 0) {
            return { products: [], collections: [], summary: 'Error: quantity must be 0 or greater. Set to 0 to remove the item.' };
        }

        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found. Your cart is empty.' };
            }

            let result;
            if (quantity === 0) {
                result = await this.orderService.removeItemFromOrder(ctx, order.id, Number(orderLineId));
            } else {
                result = await this.orderService.adjustOrderLine(ctx, order.id, Number(orderLineId), quantity);
            }

            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? (result as any).errorCode ?? 'Unknown error';
                this.logger.warn(`adjustOrderLine error: ${errorMsg}`);
                return { products: [], collections: [], summary: `Error adjusting cart: ${errorMsg}` };
            }

            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const fullOrder = await orderRepo.findOne({
                where: { id: order.id },
                relations: ['lines', 'lines.productVariant', 'lines.productVariant.translations', 'lines.featuredAsset'],
            });

            if (!fullOrder || !fullOrder.lines || fullOrder.lines.length === 0) {
                return {
                    products: [],
                    collections: [],
                    activeOrder: { id: String(order.id), code: order.code, totalQuantity: 0, totalWithTax: 0, lines: [] },
                    summary: quantity === 0
                        ? 'Item removed. Your cart is now empty.'
                        : 'Cart updated. Your cart is now empty.',
                };
            }

            const activeOrder = this.mapper.mapActiveOrder(fullOrder);
            const action = quantity === 0 ? 'removed' : `quantity updated to ${quantity}`;
            const linesSummary = activeOrder.lines
                .map(l => `${l.quantity}x "${l.productName}" (orderLineId: ${l.orderLineId})`)
                .join(', ');

            return {
                products: [],
                collections: [],
                activeOrder,
                summary: `Item ${action}. Cart now has ${activeOrder.totalQuantity} item(s), total: ${formatPrice(activeOrder.totalWithTax)}. Lines: ${linesSummary}`,
            };
        } catch (e) {
            this.logger.error(`Error adjusting order line: ${e}`);
            return { products: [], collections: [], summary: 'Error adjusting your cart. Please try again.' };
        }
    }
}
