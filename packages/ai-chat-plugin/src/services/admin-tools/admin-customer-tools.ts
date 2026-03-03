import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Customer, Order } from '@vendure/core';
import { formatPrice } from '../../constants';

interface AdminToolResult {
    summary: string;
}

export class AdminCustomerTools {
    private readonly logger = new Logger(AdminCustomerTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async searchCustomers(
        ctx: RequestContext,
        args: { query: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 10, 25);

        if (!query) {
            return { summary: 'No search query provided.' };
        }

        try {
            const customerRepo = this.connection.rawConnection.getRepository(Customer);
            const customers = await customerRepo.createQueryBuilder('customer')
                .leftJoinAndSelect('customer.user', 'user')
                .where('customer.deletedAt IS NULL')
                .andWhere(
                    '(LOWER(customer.firstName) LIKE :term OR LOWER(customer.lastName) LIKE :term OR LOWER(customer.emailAddress) LIKE :term)',
                    { term: `%${query.toLowerCase()}%` },
                )
                .take(take)
                .getMany();

            if (customers.length === 0) {
                return { summary: `No customers found matching "${query}".` };
            }

            // Get order counts and totals for each customer
            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const lines: string[] = [];

            for (const c of customers) {
                const orderStats = await orderRepo.createQueryBuilder('order')
                    .select('COUNT(order.id)', 'count')
                    .addSelect('COALESCE(SUM(order.totalWithTax), 0)', 'total')
                    .where('order.customerId = :customerId', { customerId: c.id })
                    .andWhere('order.active = :active', { active: false })
                    .getRawOne();

                const orderCount = parseInt(orderStats?.count ?? '0', 10);
                const totalSpent = parseInt(orderStats?.total ?? '0', 10);
                const created = c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : 'N/A';

                lines.push(
                    `- **${c.firstName ?? ''} ${c.lastName ?? ''}** (ID: ${c.id}) | ${c.emailAddress ?? 'no email'} | ${orderCount} order(s) | Total spent: ${formatPrice(totalSpent)} | Joined: ${created}`,
                );
            }

            return {
                summary: `Found ${customers.length} customer(s) matching "${query}":\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error searching customers: ${e}`);
            return { summary: 'Error searching customers. Please try again.' };
        }
    }
}
