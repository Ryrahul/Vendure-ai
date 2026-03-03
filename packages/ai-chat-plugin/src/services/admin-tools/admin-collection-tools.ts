import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Collection } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminCollectionTools {
    private readonly logger = new Logger(AdminCollectionTools.name);

    constructor(
        private connection: TransactionalConnection,
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
}
