import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    Country,
    CountryService,
    LanguageCode,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminCountryTools {
    private readonly logger = new Logger(AdminCountryTools.name);

    constructor(
        private connection: TransactionalConnection,
        private countryService: CountryService,
    ) {}

    // ─── Read operations ────────────────────────────────────────────────

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

    // ─── Mutations ──────────────────────────────────────────────────────

    async createCountry(
        ctx: RequestContext,
        args: { code: string; name: string; enabled?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                code: args.code,
                enabled: args.enabled ?? true,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                    },
                ],
            };

            const result = await this.countryService.create(ctx, input);

            const name = (result as any).translations?.[0]?.name ?? args.name;
            return { summary: `Country "${name}" (code: ${args.code}) created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating country: ${e}`);
            return { summary: `Error creating country: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateCountry(
        ctx: RequestContext,
        args: { countryId: string; name?: string; code?: string; enabled?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.countryId,
            };

            if (args.name !== undefined) {
                input.translations = [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                    },
                ];
            }

            if (args.code !== undefined) {
                input.code = args.code;
            }

            if (args.enabled !== undefined) {
                input.enabled = args.enabled;
            }

            const result = await this.countryService.update(ctx, input);

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Country "${name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating country: ${e}`);
            return { summary: `Error updating country: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteCountry(
        ctx: RequestContext,
        args: { countryId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.countryService.delete(ctx, args.countryId);

            if (result.result === 'DELETED') {
                return { summary: `Country (ID: ${args.countryId}) deleted successfully.` };
            }

            return { summary: `Failed to delete country (ID: ${args.countryId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting country: ${e}`);
            return { summary: `Error deleting country: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
