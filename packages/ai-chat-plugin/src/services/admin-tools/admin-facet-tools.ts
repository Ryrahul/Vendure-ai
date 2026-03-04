import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Facet, FacetValue } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminFacetTools {
    private readonly logger = new Logger(AdminFacetTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async getFacets(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Facet);

        let qb = repo.createQueryBuilder('facet')
            .leftJoinAndSelect('facet.translations', 'translation')
            .leftJoinAndSelect('facet.values', 'facetValue')
            .leftJoinAndSelect('facetValue.translations', 'fvTranslation')
            .leftJoinAndSelect('facet.channels', 'channel');

        if (query) {
            qb = qb.where('(LOWER(translation.name) LIKE :term OR LOWER(facet.code) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('facet.createdAt', 'DESC').take(take);

        try {
            const facets = await qb.getMany();

            if (facets.length === 0) {
                return { summary: query ? `No facets found matching "${query}".` : 'No facets configured.' };
            }

            const lines = facets.map(f => {
                const name = (f as any).translations?.[0]?.name ?? '';
                const code = (f as any).code ?? '';
                const isPrivate = (f as any).isPrivate ? ' (PRIVATE)' : '';
                const values = ((f as any).values ?? []) as any[];
                const valueNames = values.map((v: any) => {
                    const vName = v.translations?.[0]?.name ?? v.code ?? '';
                    return vName;
                });
                const valuesStr = valueNames.length > 0
                    ? (valueNames.length <= 8 ? valueNames.join(', ') : `${valueNames.slice(0, 8).join(', ')} (+${valueNames.length - 8} more)`)
                    : 'no values';
                const channels = ((f as any).channels ?? []).map((c: any) => c.code).join(', ') || 'none';
                return `- **${name}** (ID: ${f.id}) | Code: \`${code}\`${isPrivate} | ${values.length} value(s): ${valuesStr} | Channels: ${channels}`;
            });

            return {
                summary: `Found ${facets.length} facet(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching facets: ${e}`);
            return { summary: 'Error fetching facets. Please try again.' };
        }
    }

    async getFacetValues(
        ctx: RequestContext,
        args: { facetId?: string; query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 100);

        const repo = this.connection.rawConnection.getRepository(FacetValue);

        let qb = repo.createQueryBuilder('fv')
            .leftJoinAndSelect('fv.translations', 'translation')
            .leftJoinAndSelect('fv.facet', 'facet')
            .leftJoinAndSelect('facet.translations', 'facetTranslation');

        if (args.facetId) {
            qb = qb.where('fv.facetId = :facetId', { facetId: args.facetId });
        }

        if (query) {
            const whereMethod = args.facetId ? 'andWhere' : 'where';
            qb = qb[whereMethod]('(LOWER(translation.name) LIKE :term OR LOWER(fv.code) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('fv.createdAt', 'DESC').take(take);

        try {
            const values = await qb.getMany();

            if (values.length === 0) {
                return { summary: query ? `No facet values found matching "${query}".` : 'No facet values found.' };
            }

            const lines = values.map(v => {
                const name = (v as any).translations?.[0]?.name ?? '';
                const code = (v as any).code ?? '';
                const facetName = (v as any).facet?.translations?.[0]?.name ?? (v as any).facet?.code ?? 'N/A';
                return `- **${name}** (ID: ${v.id}) | Code: \`${code}\` | Facet: ${facetName}`;
            });

            return {
                summary: `Found ${values.length} facet value(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching facet values: ${e}`);
            return { summary: 'Error fetching facet values. Please try again.' };
        }
    }
}
