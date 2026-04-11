import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    Collection,
    CollectionService,
    LanguageCode,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminCollectionTools {
    private readonly logger = new Logger(AdminCollectionTools.name);

    constructor(
        private connection: TransactionalConnection,
        private collectionService: CollectionService,
    ) {}

    async getCollections(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Collection);

        let qb = repo.createQueryBuilder('collection')
            .leftJoinAndSelect('collection.translations', 'translation')
            .loadRelationCountAndMap('collection.productCount', 'collection.productVariants')
            .where('collection.isRoot = :isRoot', { isRoot: false });

        if (query) {
            qb = qb.andWhere('LOWER(translation.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        qb = qb.orderBy('collection.position', 'ASC').take(take);

        try {
            const collections = await qb.getMany();

            if (collections.length === 0) {
                return { summary: query ? `No collections found matching "${query}".` : 'No collections found.' };
            }

            const lines = collections.map(c => {
                const name = (c as any).translations?.[0]?.name ?? '';
                const slug = (c as any).translations?.[0]?.slug ?? '';
                const isPrivate = (c as any).isPrivate ? ' (PRIVATE)' : '';
                const productCount = (c as any).productCount ?? '?';
                return `- **${name}** (ID: ${c.id}) | Slug: ${slug} | ${productCount} product(s)${isPrivate}`;
            });

            return {
                summary: `Found ${collections.length} collection(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching collections: ${e}`);
            return { summary: 'Error fetching collections. Please try again.' };
        }
    }

    async createCollection(
        ctx: RequestContext,
        args: {
            name: string;
            slug?: string;
            description?: string;
            parentId?: string;
            isPrivate?: boolean;
            filters?: Array<{ code: string; args: Record<string, string> }>;
        },
    ): Promise<AdminToolResult> {
        try {
            const filtersInput = (args.filters ?? []).map(f => ({
                code: f.code,
                arguments: Object.entries(f.args).map(([name, value]) => ({ name, value })),
            }));

            const input = {
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                        slug: args.slug ?? '',
                        description: args.description ?? '',
                    },
                ],
                parentId: args.parentId,
                isPrivate: args.isPrivate ?? false,
                filters: filtersInput,
            };

            const result = await this.collectionService.create(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to create collection: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? args.name;
            return { summary: `Collection "${name}" created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating collection: ${e}`);
            return { summary: `Error creating collection: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateCollection(
        ctx: RequestContext,
        args: {
            collectionId: string;
            name?: string;
            slug?: string;
            description?: string;
            isPrivate?: boolean;
            filters?: Array<{ code: string; args: Record<string, string> }>;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.collectionId,
            };

            if (args.name !== undefined || args.slug !== undefined || args.description !== undefined) {
                input.translations = [
                    {
                        languageCode: LanguageCode.en,
                        ...(args.name !== undefined && { name: args.name }),
                        ...(args.slug !== undefined && { slug: args.slug }),
                        ...(args.description !== undefined && { description: args.description }),
                    },
                ];
            }

            if (args.isPrivate !== undefined) {
                input.isPrivate = args.isPrivate;
            }

            if (args.filters !== undefined) {
                input.filters = args.filters.map(f => ({
                    code: f.code,
                    arguments: Object.entries(f.args).map(([name, value]) => ({ name, value })),
                }));
            }

            const result = await this.collectionService.update(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update collection: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Collection "${name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating collection: ${e}`);
            return { summary: `Error updating collection: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteCollection(
        ctx: RequestContext,
        args: { collectionId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.collectionService.delete(ctx, args.collectionId);

            if (result.result === 'DELETED') {
                return { summary: `Collection (ID: ${args.collectionId}) deleted successfully.` };
            }

            return { summary: `Failed to delete collection (ID: ${args.collectionId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting collection: ${e}`);
            return { summary: `Error deleting collection: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async moveCollection(
        ctx: RequestContext,
        args: { collectionId: string; parentId: string; index: number },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.collectionService.move(ctx, {
                collectionId: args.collectionId,
                parentId: args.parentId,
                index: args.index,
            });

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Collection "${name}" (ID: ${result.id}) moved successfully to parent ${args.parentId} at index ${args.index}.` };
        } catch (e) {
            this.logger.error(`Error moving collection: ${e}`);
            return { summary: `Error moving collection: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
