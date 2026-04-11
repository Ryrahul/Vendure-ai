import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, CustomerGroup, CustomerGroupService } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminCustomerGroupTools {
    private readonly logger = new Logger(AdminCustomerGroupTools.name);

    constructor(
        private connection: TransactionalConnection,
        private customerGroupService: CustomerGroupService,
    ) {}

    async getCustomerGroups(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(CustomerGroup);

        let qb = repo.createQueryBuilder('customerGroup')
            .loadRelationCountAndMap('customerGroup.customerCount', 'customerGroup.customers');

        if (query) {
            qb = qb.where('LOWER(customerGroup.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        qb = qb.orderBy('customerGroup.createdAt', 'DESC').take(take);

        try {
            const groups = await qb.getMany();

            if (groups.length === 0) {
                return { summary: query ? `No customer groups found matching "${query}".` : 'No customer groups found.' };
            }

            const lines = groups.map(g => {
                const name = g.name ?? '';
                const customerCount = (g as any).customerCount ?? '?';
                return `- **${name}** (ID: ${g.id}) | ${customerCount} customer(s)`;
            });

            return {
                summary: `Found ${groups.length} customer group(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching customer groups: ${e}`);
            return { summary: 'Error fetching customer groups. Please try again.' };
        }
    }

    async createCustomerGroup(
        ctx: RequestContext,
        args: { name: string; customerIds?: string[] },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                name: args.name,
                customerIds: args.customerIds ?? [],
            };

            const result = await this.customerGroupService.create(ctx, input);

            return { summary: `Customer group "${result.name}" created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating customer group: ${e}`);
            return { summary: `Error creating customer group: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateCustomerGroup(
        ctx: RequestContext,
        args: { customerGroupId: string; name?: string },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.customerGroupId,
            };

            if (args.name !== undefined) {
                input.name = args.name;
            }

            const result = await this.customerGroupService.update(ctx, input);

            return { summary: `Customer group "${result.name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating customer group: ${e}`);
            return { summary: `Error updating customer group: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteCustomerGroup(
        ctx: RequestContext,
        args: { customerGroupId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.customerGroupService.delete(ctx, args.customerGroupId);

            if (result.result === 'DELETED') {
                return { summary: `Customer group (ID: ${args.customerGroupId}) deleted successfully.` };
            }

            return { summary: `Failed to delete customer group (ID: ${args.customerGroupId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting customer group: ${e}`);
            return { summary: `Error deleting customer group: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async addCustomersToGroup(
        ctx: RequestContext,
        args: { customerGroupId: string; customerIds: string[] },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.customerGroupService.addCustomersToGroup(ctx, {
                customerGroupId: args.customerGroupId,
                customerIds: args.customerIds,
            });

            return { summary: `Added ${args.customerIds.length} customer(s) to group "${result.name}" (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error adding customers to group: ${e}`);
            return { summary: `Error adding customers to group: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async removeCustomersFromGroup(
        ctx: RequestContext,
        args: { customerGroupId: string; customerIds: string[] },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.customerGroupService.removeCustomersFromGroup(ctx, {
                customerGroupId: args.customerGroupId,
                customerIds: args.customerIds,
            });

            return { summary: `Removed ${args.customerIds.length} customer(s) from group "${result.name}" (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error removing customers from group: ${e}`);
            return { summary: `Error removing customers from group: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
