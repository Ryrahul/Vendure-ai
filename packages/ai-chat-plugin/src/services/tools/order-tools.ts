import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Order } from '@vendure/core';
import { ChatResultMapper } from '../chat-result-mapper';
import { formatPrice } from '../../constants';
import type { ToolResult } from '../types';

export class OrderTools {
    private readonly logger = new Logger(OrderTools.name);

    constructor(
        private connection: TransactionalConnection,
        private mapper: ChatResultMapper,
    ) {}

    /**
     * getOrderHistory: fetches the customer's past orders using raw query for reliable relation loading.
     */
    async getOrderHistory(
        ctx: RequestContext,
        args: Record<string, unknown>,
        customerId?: string | number,
    ): Promise<ToolResult> {
        if (!customerId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to view order history.', orders: [] };
        }

        const take = Math.min(Number(args.take) || 5, 10);

        try {
            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const orders = await orderRepo.createQueryBuilder('order')
                .leftJoinAndSelect('order.lines', 'line')
                .leftJoinAndSelect('line.productVariant', 'variant')
                .leftJoinAndSelect('variant.translations', 'variantTranslation')
                .leftJoinAndSelect('order.fulfillments', 'fulfillment')
                .where('order.customerId = :customerId', { customerId })
                .andWhere('order.active = :active', { active: false })
                .orderBy('order.orderPlacedAt', 'DESC')
                .take(take)
                .getMany();

            const mapped = this.mapper.mapOrders(orders);

            return {
                products: [],
                collections: [],
                orders: mapped,
                summary: mapped.length > 0
                    ? `Found ${mapped.length} order(s). ${mapped.map(o => `Order ${o.code}: ${o.state}, total ${formatPrice(o.total)}, placed ${o.orderPlacedAt ?? 'N/A'}, items: ${o.lines.map(l => `${l.quantity}x ${l.productName}`).join(', ')}`).join(' | ')}`
                    : 'No past orders found.',
            };
        } catch (e) {
            this.logger.error(`Error fetching order history: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching order history. Please try again.', orders: [] };
        }
    }

    async trackOrder(
        ctx: RequestContext,
        args: Record<string, unknown>,
        customerId?: string | number,
    ): Promise<ToolResult> {
        if (!customerId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to track orders.', orders: [] };
        }

        const orderId = args.orderId ? String(args.orderId).trim() : undefined;
        const orderCode = args.orderCode ? String(args.orderCode).trim() : undefined;

        if (!orderId && !orderCode) {
            return { products: [], collections: [], summary: 'Error: Please provide an orderId or orderCode to track. You can use getOrderHistory first to find your orders.', orders: [] };
        }

        try {
            const orderRepo = this.connection.rawConnection.getRepository(Order);
            let qb = orderRepo.createQueryBuilder('order')
                .leftJoinAndSelect('order.lines', 'line')
                .leftJoinAndSelect('line.productVariant', 'variant')
                .leftJoinAndSelect('variant.translations', 'variantTranslation')
                .leftJoinAndSelect('order.fulfillments', 'fulfillment')
                .where('order.customerId = :customerId', { customerId });

            if (orderId) {
                qb = qb.andWhere('order.id = :orderId', { orderId });
            } else if (orderCode) {
                qb = qb.andWhere('order.code = :orderCode', { orderCode });
            }

            const order = await qb.getOne();

            if (!order) {
                return { products: [], collections: [], summary: `No order found with ${orderId ? `ID ${orderId}` : `code "${orderCode}"`}.`, orders: [] };
            }

            const mapped = this.mapper.mapOrders([order]);

            const o = mapped[0];
            const fulfillmentInfo = o.fulfillments.length > 0
                ? o.fulfillments.map(f => `${f.state}${f.trackingCode ? ` (tracking: ${f.trackingCode})` : ''} via ${f.method}`).join(', ')
                : 'No fulfillment yet';

            return {
                products: [],
                collections: [],
                orders: mapped,
                summary: `Order ${o.code}: State: ${o.state}, Total: ${formatPrice(o.total)}, Placed: ${o.orderPlacedAt ?? 'N/A'}. Fulfillment: ${fulfillmentInfo}. Items: ${o.lines.map(l => `${l.quantity}x ${l.productName}`).join(', ')}`,
            };
        } catch (e) {
            this.logger.error(`Error tracking order: ${e}`);
            return { products: [], collections: [], summary: 'Error tracking order. Please try again.', orders: [] };
        }
    }
}
