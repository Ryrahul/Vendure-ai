import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    Facet,
    FacetValue,
    FacetService,
    FacetValueService,
    LanguageCode,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminFacetTools {
    private readonly logger = new Logger(AdminFacetTools.name);

    constructor(
        private connection: TransactionalConnection,
        private facetService: FacetService,
        private facetValueService: FacetValueService,
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

    async createFacet(
        ctx: RequestContext,
        args: {
            name: string;
            code: string;
            isPrivate?: boolean;
            values?: Array<{ name: string; code: string }>;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                code: args.code,
                isPrivate: args.isPrivate ?? false,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                    },
                ],
            };

            if (args.values && args.values.length > 0) {
                input.values = args.values.map(v => ({
                    code: v.code,
                    translations: [
                        {
                            languageCode: LanguageCode.en,
                            name: v.name,
                        },
                    ],
                }));
            }

            const result = await this.facetService.create(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to create facet: ${(result as any).message ?? 'Unknown error'}` };
            }

            const valuesCreated = (result as any).values?.length ?? 0;
            return {
                summary: `Facet "${args.name}" (ID: ${result.id}, code: "${args.code}") created successfully with ${valuesCreated} value(s).`,
            };
        } catch (e) {
            this.logger.error(`Error creating facet: ${e}`);
            return { summary: `Error creating facet: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateFacet(
        ctx: RequestContext,
        args: {
            facetId: string;
            name?: string;
            code?: string;
            isPrivate?: boolean;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.facetId,
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

            if (args.isPrivate !== undefined) {
                input.isPrivate = args.isPrivate;
            }

            const result = await this.facetService.update(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update facet: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Facet "${name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating facet: ${e}`);
            return { summary: `Error updating facet: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteFacet(
        ctx: RequestContext,
        args: { facetId: string; force?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.facetService.delete(ctx, args.facetId, args.force ?? false);

            if (result.result === 'DELETED') {
                return { summary: `Facet (ID: ${args.facetId}) deleted successfully.` };
            }

            return { summary: `Failed to delete facet (ID: ${args.facetId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting facet: ${e}`);
            return { summary: `Error deleting facet: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async createFacetValues(
        ctx: RequestContext,
        args: {
            facetId: string;
            values: Array<{ name: string; code: string }>;
        },
    ): Promise<AdminToolResult> {
        try {
            const facet = await this.facetService.findOne(ctx, args.facetId);
            if (!facet) {
                return { summary: `Facet (ID: ${args.facetId}) not found.` };
            }

            const createdValues: Array<{ id: any; name: string }> = [];

            for (const v of args.values) {
                const input = {
                    code: v.code,
                    facetId: args.facetId,
                    translations: [
                        {
                            languageCode: LanguageCode.en,
                            name: v.name,
                        },
                    ],
                };

                const result = await this.facetValueService.create(ctx, facet, input);

                if (isGraphQlErrorResult(result)) {
                    createdValues.push({ id: 'ERROR', name: `${v.name}: ${(result as any).message ?? 'failed'}` });
                } else {
                    createdValues.push({ id: result.id, name: v.name });
                }
            }

            const lines = createdValues.map(v =>
                v.id === 'ERROR' ? `- FAILED: ${v.name}` : `- "${v.name}" (ID: ${v.id})`,
            );

            return {
                summary: `Created ${createdValues.filter(v => v.id !== 'ERROR').length}/${args.values.length} facet value(s) for facet (ID: ${args.facetId}):\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error creating facet values: ${e}`);
            return { summary: `Error creating facet values: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateFacetValue(
        ctx: RequestContext,
        args: {
            facetValueId: string;
            name?: string;
            code?: string;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.facetValueId,
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

            const result = await this.facetValueService.update(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update facet value: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Facet value "${name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating facet value: ${e}`);
            return { summary: `Error updating facet value: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteFacetValues(
        ctx: RequestContext,
        args: { facetValueIds: string[]; force?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const succeeded: string[] = [];
            const failed: Array<{ id: string; message: string }> = [];

            for (const id of args.facetValueIds) {
                const result = await this.facetValueService.delete(ctx, id, args.force ?? false);

                if (result.result === 'DELETED') {
                    succeeded.push(id);
                } else {
                    failed.push({ id, message: result.message ?? 'Unknown error' });
                }
            }

            let summary = `Deleted ${succeeded.length}/${args.facetValueIds.length} facet value(s).`;

            if (failed.length > 0) {
                const failMessages = failed.map(f => `ID ${f.id}: ${f.message}`).join('; ');
                summary += ` Failures: ${failMessages}`;
            }

            return { summary };
        } catch (e) {
            this.logger.error(`Error deleting facet values: ${e}`);
            return { summary: `Error deleting facet values: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
