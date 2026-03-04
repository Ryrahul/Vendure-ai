import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Country } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminCountryTools {
    private readonly logger = new Logger(AdminCountryTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async getCountries(
        ctx: RequestContext,
        args: { query?: string; enabledOnly?: boolean; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 100);

        const repo = this.connection.rawConnection.getRepository(Country);

        let qb = repo.createQueryBuilder('country')
            .leftJoinAndSelect('country.translations', 'translation');

        if (query) {
            qb = qb.where('(LOWER(translation.name) LIKE :term OR LOWER(country.code) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        if (args.enabledOnly) {
            const whereMethod = query ? 'andWhere' : 'where';
            qb = qb[whereMethod]('country.enabled = :enabled', { enabled: true });
        }

        qb = qb.orderBy('country.code', 'ASC').take(take);

        try {
            const countries = await qb.getMany();

            if (countries.length === 0) {
                return { summary: query ? `No countries found matching "${query}".` : 'No countries configured.' };
            }

            const lines = countries.map(c => {
                const name = (c as any).translations?.[0]?.name ?? '';
                const code = (c as any).code ?? '';
                const enabled = (c as any).enabled ? 'Enabled' : 'DISABLED';
                return `- **${name}** (ID: ${c.id}) | Code: \`${code}\` | ${enabled}`;
            });

            return {
                summary: `Found ${countries.length} country/countries${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching countries: ${e}`);
            return { summary: 'Error fetching countries. Please try again.' };
        }
    }
}
