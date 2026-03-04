import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, PaymentMethod } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminPaymentTools {
    private readonly logger = new Logger(AdminPaymentTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async getPaymentMethods(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(PaymentMethod);

        let qb = repo.createQueryBuilder('pm')
            .leftJoinAndSelect('pm.translations', 'translation')
            .leftJoinAndSelect('pm.channels', 'channel');

        if (query) {
            qb = qb.where('(LOWER(translation.name) LIKE :term OR LOWER(pm.code) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('pm.createdAt', 'DESC').take(take);

        try {
            const methods = await qb.getMany();

            if (methods.length === 0) {
                return { summary: query ? `No payment methods found matching "${query}".` : 'No payment methods configured.' };
            }

            const lines = methods.map(m => {
                const name = (m as any).translations?.[0]?.name ?? '';
                const description = (m as any).translations?.[0]?.description ?? '';
                const code = (m as any).code ?? '';
                const enabled = (m as any).enabled ? 'Enabled' : 'DISABLED';
                const handler = (m as any).handler?.code ?? 'N/A';
                const checker = (m as any).checker?.code ?? 'none';
                const channels = ((m as any).channels ?? []).map((c: any) => c.code).join(', ') || 'none';
                const descSnippet = description.length > 100 ? description.substring(0, 100) + '...' : description;
                return `- **${name}** (ID: ${m.id}) | Code: \`${code}\` | ${enabled} | Handler: ${handler} | Checker: ${checker} | Channels: ${channels}${descSnippet ? ` | ${descSnippet}` : ''}`;
            });

            return {
                summary: `Found ${methods.length} payment method(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching payment methods: ${e}`);
            return { summary: 'Error fetching payment methods. Please try again.' };
        }
    }
}
