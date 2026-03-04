import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Promotion } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminPromotionTools {
    private readonly logger = new Logger(AdminPromotionTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async getPromotions(
        ctx: RequestContext,
        args: { query?: string; activeOnly?: boolean; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Promotion);

        let qb = repo.createQueryBuilder('promo')
            .leftJoinAndSelect('promo.translations', 'translation')
            .leftJoinAndSelect('promo.channels', 'channel')
            .where('promo.deletedAt IS NULL');

        if (query) {
            qb = qb.andWhere('(LOWER(translation.name) LIKE :term OR LOWER(promo.couponCode) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        if (args.activeOnly) {
            qb = qb.andWhere('promo.enabled = :enabled', { enabled: true });
            const now = new Date();
            qb = qb.andWhere('(promo.startsAt IS NULL OR promo.startsAt <= :now)', { now });
            qb = qb.andWhere('(promo.endsAt IS NULL OR promo.endsAt >= :now)', { now });
        }

        qb = qb.orderBy('promo.createdAt', 'DESC').take(take);

        try {
            const promotions = await qb.getMany();

            if (promotions.length === 0) {
                return { summary: query ? `No promotions found matching "${query}".` : 'No promotions configured.' };
            }

            const lines = promotions.map(p => {
                const name = (p as any).translations?.[0]?.name ?? '';
                const description = (p as any).translations?.[0]?.description ?? '';
                const enabled = (p as any).enabled ? 'Enabled' : 'DISABLED';
                const couponCode = (p as any).couponCode || 'none';
                const startsAt = (p as any).startsAt ? new Date((p as any).startsAt).toISOString().split('T')[0] : 'N/A';
                const endsAt = (p as any).endsAt ? new Date((p as any).endsAt).toISOString().split('T')[0] : 'N/A';
                const perCustomerLimit = (p as any).perCustomerUsageLimit ?? 0;
                const usageLimit = (p as any).usageLimit ?? 0;
                const channels = ((p as any).channels ?? []).map((c: any) => c.code).join(', ') || 'none';
                const conditions = ((p as any).conditions ?? []) as any[];
                const actions = ((p as any).actions ?? []) as any[];
                const condStr = conditions.map((c: any) => c.code).join(', ') || 'none';
                const actStr = actions.map((a: any) => a.code).join(', ') || 'none';
                const descSnippet = description && description.length > 80 ? description.substring(0, 80) + '...' : (description || '');
                return `- **${name}** (ID: ${p.id}) | ${enabled} | Coupon: \`${couponCode}\` | Dates: ${startsAt} → ${endsAt} | Limits: ${perCustomerLimit}/customer, ${usageLimit} total | Conditions: ${condStr} | Actions: ${actStr} | Channels: ${channels}${descSnippet ? ` | ${descSnippet}` : ''}`;
            });

            return {
                summary: `Found ${promotions.length} promotion(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching promotions: ${e}`);
            return { summary: 'Error fetching promotions. Please try again.' };
        }
    }
}
