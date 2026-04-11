import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    Promotion,
    PromotionService,
    LanguageCode,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminPromotionTools {
    private readonly logger = new Logger(AdminPromotionTools.name);

    constructor(
        private connection: TransactionalConnection,
        private promotionService: PromotionService,
    ) {}

    // ─── Read operations ────────────────────────────────────────────────

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

    async getPromotionConditionsAndActions(
        _ctx: RequestContext,
    ): Promise<AdminToolResult> {
        return {
            summary: [
                '**Available Promotion Conditions:**',
                '- `minimum_order_amount` — args: `{"amount": "1000", "taxInclusive": "false"}` (amount in cents, e.g. 1000 = $10.00)',
                '- `customer_group` — args: `{"customerGroupId": "<ID>"}`',
                '- `contains_products` — args: `{"minimum": "1", "productVariantIds": "[\"1\",\"2\"]"}`',
                '- `at_least_n_with_facets` — args: `{"minimum": "1", "facets": "[\"1\",\"2\"]"}`',
                '- `buy_x_get_y_free` — args: `{"amountX": "2", "variantIdsX": "[\"1\"]", "amountY": "1", "variantIdsY": "[\"2\"]"}`',
                '',
                '**Available Promotion Actions:**',
                '- `order_percentage_discount` — args: `{"discount": "10"}` (10 = 10% off)',
                '- `order_fixed_discount` — args: `{"discount": "500"}` (amount in cents, 500 = $5.00 off)',
                '- `products_percentage_discount` — args: `{"discount": "15", "productVariantIds": "[\"1\",\"2\"]"}`',
                '- `free_shipping` — args: `{}` (no arguments needed)',
                '- `buy_x_get_y_free` — args: `{}` (no arguments, uses condition to determine products)',
                '',
                '**IMPORTANT:** All argument values must be strings, even numbers. Amount/discount values are in cents for currency or plain numbers for percentages.',
            ].join('\n'),
        };
    }

    // ─── Mutations ──────────────────────────────────────────────────────

    async createPromotion(
        ctx: RequestContext,
        args: {
            name: string;
            enabled?: boolean;
            couponCode?: string;
            startsAt?: string;
            endsAt?: string;
            perCustomerUsageLimit?: number;
            usageLimit?: number;
            conditions?: Array<{ code: string; args: Record<string, string> }>;
            actions?: Array<{ code: string; args: Record<string, string> }>;
        },
    ): Promise<AdminToolResult> {
        try {
            const conditionsInput = (args.conditions ?? []).map(c => ({
                code: c.code,
                arguments: Object.entries(c.args).map(([name, value]) => ({ name, value })),
            }));

            const actionsInput = (args.actions ?? []).map(a => ({
                code: a.code,
                arguments: Object.entries(a.args).map(([name, value]) => ({ name, value })),
            }));

            const input: any = {
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                        description: '',
                    },
                ],
                enabled: args.enabled ?? true,
                couponCode: args.couponCode ?? null,
                startsAt: args.startsAt ?? null,
                endsAt: args.endsAt ?? null,
                perCustomerUsageLimit: args.perCustomerUsageLimit ?? null,
                usageLimit: args.usageLimit ?? null,
                conditions: conditionsInput,
                actions: actionsInput,
            };

            const result = await this.promotionService.createPromotion(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to create promotion: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? args.name;
            return { summary: `Promotion "${name}" created successfully (ID: ${(result as any).id}).` };
        } catch (e) {
            this.logger.error(`Error creating promotion: ${e}`);
            return { summary: `Error creating promotion: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updatePromotion(
        ctx: RequestContext,
        args: {
            promotionId: string;
            name?: string;
            enabled?: boolean;
            couponCode?: string;
            startsAt?: string;
            endsAt?: string;
            perCustomerUsageLimit?: number;
            usageLimit?: number;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.promotionId,
            };

            if (args.name !== undefined) {
                input.translations = [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                    },
                ];
            }

            if (args.enabled !== undefined) input.enabled = args.enabled;
            if (args.couponCode !== undefined) input.couponCode = args.couponCode;
            if (args.startsAt !== undefined) input.startsAt = args.startsAt;
            if (args.endsAt !== undefined) input.endsAt = args.endsAt;
            if (args.perCustomerUsageLimit !== undefined) input.perCustomerUsageLimit = args.perCustomerUsageLimit;
            if (args.usageLimit !== undefined) input.usageLimit = args.usageLimit;

            const result = await this.promotionService.updatePromotion(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update promotion: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Promotion "${name}" (ID: ${(result as any).id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating promotion: ${e}`);
            return { summary: `Error updating promotion: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deletePromotion(
        ctx: RequestContext,
        args: { promotionId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.promotionService.softDeletePromotion(ctx, args.promotionId);

            if (result.result === 'DELETED') {
                return { summary: `Promotion (ID: ${args.promotionId}) deleted successfully.` };
            }

            return { summary: `Failed to delete promotion (ID: ${args.promotionId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting promotion: ${e}`);
            return { summary: `Error deleting promotion: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
