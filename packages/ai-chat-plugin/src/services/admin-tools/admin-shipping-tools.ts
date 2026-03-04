import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, ShippingMethod } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminShippingTools {
    private readonly logger = new Logger(AdminShippingTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async getShippingMethods(
        ctx: RequestContext,
        args: { query?: string; take?: number; includeDeleted?: boolean },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(ShippingMethod);

        let qb = repo.createQueryBuilder('sm')
            .leftJoinAndSelect('sm.translations', 'translation')
            .leftJoinAndSelect('sm.channels', 'channel');

        if (!args.includeDeleted) {
            qb = qb.where('sm.deletedAt IS NULL');
        }

        if (query) {
            qb = qb.andWhere('(LOWER(translation.name) LIKE :term OR LOWER(sm.code) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('sm.createdAt', 'DESC').take(take);

        try {
            const methods = await qb.getMany();

            if (methods.length === 0) {
                return { summary: query ? `No shipping methods found matching "${query}".` : 'No shipping methods configured.' };
            }

            const lines = methods.map(m => {
                const name = (m as any).translations?.[0]?.name ?? '';
                const description = (m as any).translations?.[0]?.description ?? '';
                const code = (m as any).code ?? '';
                const fulfillmentHandler = (m as any).fulfillmentHandlerCode ?? 'N/A';
                const deleted = (m as any).deletedAt ? ' (DELETED)' : '';
                const channels = ((m as any).channels ?? []).map((c: any) => c.code).join(', ') || 'none';
                const descSnippet = description.length > 100 ? description.substring(0, 100) + '...' : description;
                return `- **${name}** (ID: ${m.id}) | Code: \`${code}\` | Fulfillment: ${fulfillmentHandler} | Channels: ${channels}${deleted}${descSnippet ? ` | ${descSnippet}` : ''}`;
            });

            return {
                summary: `Found ${methods.length} shipping method(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching shipping methods: ${e}`);
            return { summary: 'Error fetching shipping methods. Please try again.' };
        }
    }
}
