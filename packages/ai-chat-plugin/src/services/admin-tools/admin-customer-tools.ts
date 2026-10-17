import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Customer, Order, CustomerService } from '@vendure/core';
import { formatPrice } from '../../constants';

interface AdminToolResult {
    summary: string;
}

export class AdminCustomerTools {
    private readonly logger = new Logger(AdminCustomerTools.name);

    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
    ) {}

    async searchCustomers(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 10, 25);

        try {
            const customerRepo = this.connection.rawConnection.getRepository(Customer);
            let qb = customerRepo.createQueryBuilder('customer')
                .leftJoinAndSelect('customer.user', 'user')
                .where('customer.deletedAt IS NULL');

            if (query) {
                qb = qb.andWhere(
                    '(LOWER(customer.firstName) LIKE :term OR LOWER(customer.lastName) LIKE :term OR LOWER(customer.emailAddress) LIKE :term)',
                    { term: `%${query.toLowerCase()}%` },
                );
            }

            const totalCount = await qb.getCount();
            const customers = await qb.orderBy('customer.createdAt', 'DESC').take(take).getMany();

            if (customers.length === 0) {
                return { summary: query ? `No customers found matching "${query}".` : `No customers found in the store (total: 0).` };
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
                    `- **${c.firstName ?? ''} ${c.lastName ?? ''}** (ID: ${c.id}) | ${c.emailAddress ?? 'no email'} | ${orderCount} order(s) | Total spent: ${formatPrice(totalSpent, ctx.currencyCode)} | Joined: ${created}`,
                );
            }

            const matchText = query ? `matching "${query}"` : '(most recent)';
            return {
                summary: `Found ${totalCount} total customer(s) ${matchText}, showing ${customers.length}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error searching customers: ${e}`);
            return { summary: 'Error searching customers. Please try again.' };
        }
    }

    async getCustomerDetails(
        ctx: RequestContext,
        args: { customerId: string },
    ): Promise<AdminToolResult> {
        try {
            const customerRepo = this.connection.rawConnection.getRepository(Customer);
            const customer = await customerRepo.createQueryBuilder('customer')
                .leftJoinAndSelect('customer.user', 'user')
                .leftJoinAndSelect('customer.addresses', 'address')
                .leftJoinAndSelect('address.country', 'country')
                .leftJoinAndSelect('country.translations', 'countryTranslation')
                .leftJoinAndSelect('customer.groups', 'customerGroup')
                .where('customer.id = :id', { id: args.customerId })
                .andWhere('customer.deletedAt IS NULL')
                .getOne();

            if (!customer) {
                return { summary: `Customer with ID ${args.customerId} not found.` };
            }

            const name = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
            const email = customer.emailAddress ?? 'N/A';
            const phone = (customer as any).phoneNumber || 'N/A';
            const title = (customer as any).title || '';
            const created = customer.createdAt ? new Date(customer.createdAt).toISOString().split('T')[0] : 'N/A';

            // Addresses
            const addresses = ((customer as any).addresses ?? []) as any[];
            const addressLines = addresses.length > 0
                ? addresses.map((a: any) => {
                    const countryName = a.country?.translations?.[0]?.name ?? a.country?.code ?? '';
                    const parts = [
                        a.fullName,
                        a.company,
                        a.streetLine1,
                        a.streetLine2,
                        [a.city, a.province, a.postalCode].filter(Boolean).join(', '),
                        countryName,
                        a.phoneNumber ? `Phone: ${a.phoneNumber}` : '',
                    ].filter(Boolean).join(', ');
                    const flags: string[] = [];
                    if (a.defaultShippingAddress) flags.push('DEFAULT SHIPPING');
                    if (a.defaultBillingAddress) flags.push('DEFAULT BILLING');
                    const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
                    return `  - ${parts}${flagStr} (ID: ${a.id})`;
                }).join('\n')
                : '  - No addresses on file';

            // Customer groups
            const groups = ((customer as any).groups ?? []) as any[];
            const groupStr = groups.length > 0
                ? groups.map((g: any) => g.name ?? g.code ?? `ID:${g.id}`).join(', ')
                : 'None';

            // Order history summary
            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const orderStats = await orderRepo.createQueryBuilder('order')
                .select('COUNT(order.id)', 'count')
                .addSelect('COALESCE(SUM(order.totalWithTax), 0)', 'total')
                .addSelect('MAX(order.orderPlacedAt)', 'lastOrder')
                .where('order.customerId = :customerId', { customerId: customer.id })
                .andWhere('order.active = :active', { active: false })
                .getRawOne();

            const orderCount = parseInt(orderStats?.count ?? '0', 10);
            const totalSpent = parseInt(orderStats?.total ?? '0', 10);
            const lastOrderDate = orderStats?.lastOrder
                ? new Date(orderStats.lastOrder).toISOString().split('T')[0]
                : 'N/A';

            // Recent orders
            const recentOrders = await orderRepo.createQueryBuilder('order')
                .select(['order.id', 'order.code', 'order.state', 'order.totalWithTax', 'order.orderPlacedAt'])
                .where('order.customerId = :customerId', { customerId: customer.id })
                .andWhere('order.active = :active', { active: false })
                .orderBy('order.orderPlacedAt', 'DESC')
                .take(5)
                .getMany();

            const recentOrderLines = recentOrders.length > 0
                ? recentOrders.map(o => {
                    const total = (o as any).totalWithTax ?? 0;
                    const placed = (o as any).orderPlacedAt
                        ? new Date((o as any).orderPlacedAt).toISOString().split('T')[0]
                        : 'N/A';
                    return `  - ${o.code} | ${o.state} | ${formatPrice(total, ctx.currencyCode)} | ${placed}`;
                }).join('\n')
                : '  - No orders';

            const summaryParts = [
                `**${title ? title + ' ' : ''}${name}** (ID: ${customer.id})`,
                `Email: ${email} | Phone: ${phone} | Joined: ${created}`,
                '',
                `**Order Summary:** ${orderCount} order(s) | Total spent: ${formatPrice(totalSpent, ctx.currencyCode)} | Last order: ${lastOrderDate}`,
                '',
                '**Recent Orders:**',
                recentOrderLines,
                '',
                '**Addresses:**',
                addressLines,
                '',
                `**Customer Groups:** ${groupStr}`,
            ];

            return { summary: summaryParts.join('\n') };
        } catch (e) {
            this.logger.error(`Error getting customer details: ${e}`);
            return { summary: 'Error retrieving customer details. Please try again.' };
        }
    }

    async createCustomer(
        ctx: RequestContext,
        args: { firstName: string; lastName: string; emailAddress: string; phoneNumber?: string; title?: string },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                firstName: args.firstName,
                lastName: args.lastName,
                emailAddress: args.emailAddress,
            };
            if (args.phoneNumber !== undefined) input.phoneNumber = args.phoneNumber;
            if (args.title !== undefined) input.title = args.title;

            const result = await this.customerService.create(ctx, input);

            // CustomerService.create returns ErrorResultUnion<CreateCustomerResult, Customer>
            if ((result as any).__typename && (result as any).__typename !== 'Customer') {
                const errorMsg = (result as any).message ?? (result as any).errorCode ?? 'Unknown error';
                return { summary: `Failed to create customer: ${errorMsg}` };
            }

            const customer = result as Customer;
            return {
                summary: `Customer created successfully. ID: ${customer.id}, Name: "${args.firstName} ${args.lastName}", Email: "${args.emailAddress}".`,
            };
        } catch (e) {
            this.logger.error(`Error creating customer: ${e}`);
            return { summary: `Error creating customer: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async updateCustomer(
        ctx: RequestContext,
        args: { customerId: string; firstName?: string; lastName?: string; emailAddress?: string; phoneNumber?: string; title?: string },
    ): Promise<AdminToolResult> {
        try {
            const input: any = { id: args.customerId };
            if (args.firstName !== undefined) input.firstName = args.firstName;
            if (args.lastName !== undefined) input.lastName = args.lastName;
            if (args.emailAddress !== undefined) input.emailAddress = args.emailAddress;
            if (args.phoneNumber !== undefined) input.phoneNumber = args.phoneNumber;
            if (args.title !== undefined) input.title = args.title;

            const result = await this.customerService.update(ctx, input);

            // CustomerService.update returns ErrorResultUnion<UpdateCustomerResult, Customer>
            if ((result as any).__typename && (result as any).__typename !== 'Customer') {
                const errorMsg = (result as any).message ?? (result as any).errorCode ?? 'Unknown error';
                return { summary: `Failed to update customer: ${errorMsg}` };
            }

            const customer = result as Customer;
            const name = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();

            return {
                summary: `Customer updated successfully. ID: ${customer.id}, Name: "${name}".`,
            };
        } catch (e) {
            this.logger.error(`Error updating customer: ${e}`);
            return { summary: `Error updating customer: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async deleteCustomer(
        ctx: RequestContext,
        args: { customerId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.customerService.softDelete(ctx, args.customerId as any);

            if (result.result === 'DELETED') {
                return { summary: `Customer ID ${args.customerId} has been successfully deleted.` };
            } else {
                return { summary: `Could not delete customer ID ${args.customerId}: ${result.message ?? 'Unknown error'}.` };
            }
        } catch (e) {
            this.logger.error(`Error deleting customer: ${e}`);
            return { summary: `Error deleting customer: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async createCustomerAddress(
        ctx: RequestContext,
        args: {
            customerId: string;
            fullName: string;
            streetLine1: string;
            streetLine2?: string;
            city: string;
            province: string;
            postalCode: string;
            countryCode: string;
            phoneNumber?: string;
            company?: string;
            defaultShippingAddress?: boolean;
            defaultBillingAddress?: boolean;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                fullName: args.fullName,
                streetLine1: args.streetLine1,
                city: args.city,
                province: args.province,
                postalCode: args.postalCode,
                countryCode: args.countryCode,
            };
            if (args.streetLine2 !== undefined) input.streetLine2 = args.streetLine2;
            if (args.phoneNumber !== undefined) input.phoneNumber = args.phoneNumber;
            if (args.company !== undefined) input.company = args.company;
            if (args.defaultShippingAddress !== undefined) input.defaultShippingAddress = args.defaultShippingAddress;
            if (args.defaultBillingAddress !== undefined) input.defaultBillingAddress = args.defaultBillingAddress;

            const address = await this.customerService.createAddress(ctx, args.customerId as any, input);

            return {
                summary: `Address created successfully for customer ID ${args.customerId}. Address ID: ${address.id}, "${args.fullName}", ${args.streetLine1}, ${args.city}, ${args.province} ${args.postalCode}, ${args.countryCode}.`,
            };
        } catch (e) {
            this.logger.error(`Error creating customer address: ${e}`);
            return { summary: `Error creating customer address: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async addNoteToCustomer(
        ctx: RequestContext,
        args: { customerId: string; note: string; isPublic?: boolean },
    ): Promise<AdminToolResult> {
        try {
            await this.customerService.addNoteToCustomer(ctx, {
                id: args.customerId as any,
                note: args.note,
                isPublic: args.isPublic ?? false,
            });

            return {
                summary: `Note added to customer ID ${args.customerId}: "${args.note.length > 100 ? args.note.substring(0, 100) + '...' : args.note}" (${args.isPublic ? 'public' : 'private'}).`,
            };
        } catch (e) {
            this.logger.error(`Error adding note to customer: ${e}`);
            return { summary: `Error adding note to customer: ${e instanceof Error ? e.message : String(e)}` };
        }
    }
}
