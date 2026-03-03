import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Order } from '@vendure/core';
import { formatPrice } from '../../constants';
import { ChatResultMapper } from '../chat-result-mapper';
import type { ToolResult } from '../types';

export class AdminOrderTools {
    private readonly logger = new Logger(AdminOrderTools.name);

    constructor(
        private connection: TransactionalConnection,
        private mapper: ChatResultMapper,
    ) {}

    async searchOrders(
        ctx: RequestContext,
        args: {
            orderCode?: string;
            customerName?: string;
            state?: string;
            take?: number;
        },
    ): Promise<ToolResult> {
        const take = Math.min(args.take ?? 10, 25);

        const orderRepo = this.connection.rawConnection.getRepository(Order);
        let qb = orderRepo.createQueryBuilder('order')
            .leftJoinAndSelect('order.customer', 'customer')
            .leftJoinAndSelect('customer.user', 'user')
            .leftJoinAndSelect('order.lines', 'line')
            .leftJoinAndSelect('line.featuredAsset', 'lineFeaturedAsset')
            .leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
            .leftJoinAndSelect('variant.featuredAsset', 'variantFeaturedAsset')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoinAndSelect('product.featuredAsset', 'productFeaturedAsset')
            .leftJoinAndSelect('product.translations', 'productTranslation')
            .leftJoinAndSelect('order.fulfillments', 'fulfillment')
            .where('order.active = :active', { active: false });

        if (args.orderCode) {
            qb = qb.andWhere('order.code ILIKE :code', { code: `%${args.orderCode}%` });
        }
        if (args.customerName) {
            qb = qb.andWhere(
                '(LOWER(customer.firstName) LIKE :name OR LOWER(customer.lastName) LIKE :name OR LOWER(customer.emailAddress) LIKE :name)',
                { name: `%${args.customerName.toLowerCase()}%` },
            );
        }
        if (args.state) {
            qb = qb.andWhere('order.state = :state', { state: args.state });
        }

        qb = qb.orderBy('order.orderPlacedAt', 'DESC').take(take);

        try {
            const orders = await qb.getMany();

            if (orders.length === 0) {
                return { products: [], collections: [], summary: 'No orders found matching the criteria.' };
            }

            const mapped = this.mapper.mapOrders(orders);

            const summaryLines = orders.map(o => {
                const customer = (o as any).customer;
                const customerStr = customer
                    ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
                    : 'Guest';
                const total = (o as any).totalWithTax ?? 0;
                return `${o.code} (${o.state}, ${customerStr}, ${formatPrice(total)})`;
            });

            return {
                products: [],
                collections: [],
                orders: mapped,
                summary: `Found ${mapped.length} order(s): ${summaryLines.join('; ')}. Order cards are shown in the UI — keep your text brief.`,
            };
        } catch (e) {
            this.logger.error(`Error searching orders: ${e}`);
            return { products: [], collections: [], summary: 'Error searching orders. Please try again.' };
        }
    }
}
