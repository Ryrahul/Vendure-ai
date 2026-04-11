import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Asset, AssetService } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminAssetTools {
    private readonly logger = new Logger(AdminAssetTools.name);

    constructor(
        private connection: TransactionalConnection,
        private assetService: AssetService,
    ) {}

    async getAssets(
        ctx: RequestContext,
        args: { query?: string; tags?: string[]; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const tags = args.tags ?? [];
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Asset);

        let qb = repo.createQueryBuilder('asset')
            .leftJoinAndSelect('asset.tags', 'tag');

        if (query) {
            qb = qb.where('LOWER(asset.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        if (tags.length > 0) {
            const whereMethod = query ? 'andWhere' : 'where';
            qb = qb[whereMethod]('LOWER(tag.value) IN (:...tags)', {
                tags: tags.map(t => t.toLowerCase()),
            });
        }

        qb = qb.orderBy('asset.createdAt', 'DESC').take(take);

        try {
            const assets = await qb.getMany();

            if (assets.length === 0) {
                return { summary: query ? `No assets found matching "${query}".` : 'No assets found.' };
            }

            const lines = assets.map(a => {
                const name = a.name ?? '';
                const mimeType = a.mimeType ?? '';
                const fileSize = a.fileSize ?? 0;
                const source = a.source ?? '';
                const assetTags = ((a as any).tags ?? []) as any[];
                const tagNames = assetTags.map((t: any) => t.value).filter(Boolean);
                const tagsStr = tagNames.length > 0 ? tagNames.join(', ') : 'none';
                const sizeStr = fileSize > 1024 * 1024
                    ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
                    : `${(fileSize / 1024).toFixed(1)} KB`;
                return `- **${name}** (ID: ${a.id}) | Type: ${mimeType} | Size: ${sizeStr} | Source: ${source} | Tags: ${tagsStr}`;
            });

            return {
                summary: `Found ${assets.length} asset(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching assets: ${e}`);
            return { summary: 'Error fetching assets. Please try again.' };
        }
    }

    async deleteAsset(
        ctx: RequestContext,
        args: { assetId: string; force?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.assetService.delete(ctx, [args.assetId], args.force ?? false);

            if (result.result === 'DELETED') {
                return { summary: `Asset (ID: ${args.assetId}) deleted successfully.` };
            }

            return { summary: `Failed to delete asset (ID: ${args.assetId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting asset: ${e}`);
            return { summary: `Error deleting asset: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
