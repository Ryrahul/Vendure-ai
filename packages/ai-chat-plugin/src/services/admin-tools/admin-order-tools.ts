import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Order } from '@vendure/core';
import { formatPrice } from '../../constants';

interface AdminToolResult {
    summary: string;
}

export class AdminOrderTools {
    private readonly logger = new Logger(AdminOrderTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async searchOrders(
        ctx: RequestContext,
        args: {
            orderCode?: string;
            customerName?: string;
            state?: string;
            take?: number;
        },
    ): Promise<AdminToolResult> {
        const take = Math.min(args.take ?? 10, 25);

        const orderRepo = this.connection.rawConnection.getRepository(Order);
        let qb = orderRepo.createQueryBuilder('order')
            .leftJoinAndSelect('order.customer', 'customer')
            .leftJoinAndSelect('customer.user', 'user')
            .leftJoinAndSelect('order.lines', 'line')
            .leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
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
                return { summary: 'No orders found matching the criteria.' };
            }

            const lines = orders.map(o => {
                const customer = (o as any).customer;
                const customerStr = customer
                    ? `${customer.firstName ?? ''} ${customer.lastName ?? ''} (${customer.emailAddress ?? ''})`.trim()
                    : 'Guest';
                const total = (o as any).totalWithTax ?? (o as any).total ?? 0;
                const placed = (o as any).orderPlacedAt
                    ? new Date((o as any).orderPlacedAt).toISOString().split('T')[0]
                    : 'N/A';
                const itemCount = ((o as any).lines ?? []).length;
                const fulfillments = ((o as any).fulfillments ?? []) as any[];
                const fulfillmentStr = fulfillments.length > 0
                    ? fulfillments.map((f: any) => f.state).join(', ')
                    : 'None';

                return `- **${o.code}** | ${o.state} | ${customerStr} | ${formatPrice(total)} | ${placed} | ${itemCount} item(s) | Fulfillment: ${fulfillmentStr}`;
            });

            return {
                summary: `Found ${orders.length} order(s):\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error searching orders: ${e}`);
            return { summary: 'Error searching orders. Please try again.' };
        }
    }
}
