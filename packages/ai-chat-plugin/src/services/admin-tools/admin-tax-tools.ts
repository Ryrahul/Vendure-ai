import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, TaxRate, TaxCategory, Zone } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminTaxTools {
    private readonly logger = new Logger(AdminTaxTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async getTaxRates(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 100);

        const repo = this.connection.rawConnection.getRepository(TaxRate);

        let qb = repo.createQueryBuilder('tr')
            .leftJoinAndSelect('tr.category', 'category')
            .leftJoinAndSelect('tr.zone', 'zone')
            .leftJoinAndSelect('tr.customerGroup', 'customerGroup');

        if (query) {
            qb = qb.where('(LOWER(tr.name) LIKE :term OR LOWER(category.name) LIKE :term OR LOWER(zone.name) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('tr.name', 'ASC').take(take);

        try {
            const rates = await qb.getMany();

            if (rates.length === 0) {
                return { summary: query ? `No tax rates found matching "${query}".` : 'No tax rates configured.' };
            }

            const lines = rates.map(r => {
                const name = r.name ?? '';
                const value = (r as any).value ?? 0;
                const enabled = (r as any).enabled ? 'Enabled' : 'DISABLED';
                const category = (r as any).category?.name ?? 'N/A';
                const zone = (r as any).zone?.name ?? 'N/A';
                const customerGroup = (r as any).customerGroup?.name;
                const groupStr = customerGroup ? ` | Group: ${customerGroup}` : '';
                return `- **${name}** (ID: ${r.id}) | Rate: ${value}% | ${enabled} | Category: ${category} | Zone: ${zone}${groupStr}`;
            });

            return {
                summary: `Found ${rates.length} tax rate(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching tax rates: ${e}`);
            return { summary: 'Error fetching tax rates. Please try again.' };
        }
    }

    async getTaxCategories(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 50);

        const repo = this.connection.rawConnection.getRepository(TaxCategory);

        let qb = repo.createQueryBuilder('tc');

        if (query) {
            qb = qb.where('LOWER(tc.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        qb = qb.orderBy('tc.name', 'ASC').take(take);

        try {
            const categories = await qb.getMany();

            if (categories.length === 0) {
                return { summary: query ? `No tax categories found matching "${query}".` : 'No tax categories configured.' };
            }

            const lines = categories.map(c => {
                const isDefault = (c as any).isDefault ? ' (DEFAULT)' : '';
                return `- **${c.name}** (ID: ${c.id})${isDefault}`;
            });

            return {
                summary: `Found ${categories.length} tax category/categories${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching tax categories: ${e}`);
            return { summary: 'Error fetching tax categories. Please try again.' };
        }
    }

    async getZones(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 50);

        const repo = this.connection.rawConnection.getRepository(Zone);

        let qb = repo.createQueryBuilder('zone')
            .leftJoinAndSelect('zone.members', 'member')
            .leftJoinAndSelect('member.translations', 'memberTranslation');

        if (query) {
            qb = qb.where('LOWER(zone.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        qb = qb.orderBy('zone.name', 'ASC').take(take);

        try {
            const zones = await qb.getMany();

            if (zones.length === 0) {
                return { summary: query ? `No zones found matching "${query}".` : 'No zones configured.' };
            }

            const lines = zones.map(z => {
                const members = ((z as any).members ?? []) as any[];
                const memberNames = members.map((m: any) => m.translations?.[0]?.name ?? m.code ?? '').filter(Boolean);
                const memberStr = memberNames.length > 0
                    ? (memberNames.length <= 5 ? memberNames.join(', ') : `${memberNames.slice(0, 5).join(', ')} (+${memberNames.length - 5} more)`)
                    : 'no members';
                return `- **${z.name}** (ID: ${z.id}) | ${members.length} member(s): ${memberStr}`;
            });

            return {
                summary: `Found ${zones.length} zone(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching zones: ${e}`);
            return { summary: 'Error fetching zones. Please try again.' };
        }
    }
}
