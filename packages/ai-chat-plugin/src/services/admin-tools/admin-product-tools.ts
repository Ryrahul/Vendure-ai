import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Product, ProductVariant } from '@vendure/core';
import { formatPrice } from '../../constants';

interface AdminToolResult {
    summary: string;
}

export class AdminProductTools {
    private readonly logger = new Logger(AdminProductTools.name);

    constructor(
        private connection: TransactionalConnection,
        private fulltextSearchService: any,
    ) {}

    async searchProducts(
        ctx: RequestContext,
        args: { query: string; take?: number; includeDisabled?: boolean },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 10, 25);
        if (!query) {
            return { summary: 'No search query provided.' };
        }

        const repo = this.connection.rawConnection.getRepository(Product);
        let qb = repo.createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translation')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('variant.productVariantPrices', 'price')
            .leftJoinAndSelect('variant.stockLevels', 'stockLevel')
            .where('product.deletedAt IS NULL')
            .andWhere(
                '(LOWER(translation.name) LIKE :term OR LOWER(translation.description) LIKE :term)',
                { term: `%${query.toLowerCase()}%` },
            );

        // Admin can see disabled products too
        if (!args.includeDisabled) {
            qb = qb.andWhere('product.enabled = :enabled', { enabled: true });
        }

        const products = await qb.take(take).getMany();

        if (products.length === 0) {
            return { summary: `No products found matching "${query}".` };
        }

        const lines = products.map(p => {
            const name = (p as any).translations?.[0]?.name ?? '';
            const enabled = p.enabled ? 'Enabled' : 'DISABLED';
            const variants = ((p as any).variants ?? []) as any[];
            const variantCount = variants.length;
            const prices = variants.map((v: any) => {
                const priceVal = v.productVariantPrices?.[0]?.price ?? v.price ?? 0;
                return priceVal;
            });
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
            const priceStr = minPrice === maxPrice
                ? formatPrice(minPrice)
                : `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;

            // Stock info
            const totalStock = variants.reduce((sum: number, v: any) => {
                const levels = v.stockLevels ?? [];
                return sum + levels.reduce((s: number, sl: any) => s + (sl.stockOnHand ?? 0), 0);
            }, 0);

            return `- **${name}** (ID: ${p.id}) | ${enabled} | ${variantCount} variant(s) | Price: ${priceStr} | Stock: ${totalStock}`;
        });

        return {
            summary: `Found ${products.length} product(s) matching "${query}":\n${lines.join('\n')}`,
        };
    }

    async getProductDetails(
        ctx: RequestContext,
        args: { productId?: string; slug?: string },
    ): Promise<AdminToolResult> {
        const repo = this.connection.rawConnection.getRepository(Product);

        let qb = repo.createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translation')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
            .leftJoinAndSelect('variant.productVariantPrices', 'price')
            .leftJoinAndSelect('variant.stockLevels', 'stockLevel')
            .where('product.deletedAt IS NULL');

        if (args.productId) {
            qb = qb.andWhere('product.id = :id', { id: args.productId });
        } else if (args.slug) {
            qb = qb.andWhere('translation.slug = :slug', { slug: args.slug });
        } else {
            return { summary: 'Please provide a productId or slug.' };
        }

        const product = await qb.getOne();
        if (!product) {
            return { summary: `Product not found.` };
        }

        const name = (product as any).translations?.[0]?.name ?? '';
        const slug = (product as any).translations?.[0]?.slug ?? '';
        const description = (product as any).translations?.[0]?.description ?? '';
        const enabled = product.enabled ? 'Enabled' : 'DISABLED';
        const variants = ((product as any).variants ?? []) as any[];

        const variantLines = variants.map((v: any) => {
            const vName = v.translations?.[0]?.name ?? v.name ?? '';
            const priceVal = v.productVariantPrices?.[0]?.price ?? v.price ?? 0;
            const sku = v.sku ?? '';
            const levels = v.stockLevels ?? [];
            const stockOnHand = levels.reduce((s: number, sl: any) => s + (sl.stockOnHand ?? 0), 0);
            const stockAllocated = levels.reduce((s: number, sl: any) => s + (sl.stockAllocated ?? 0), 0);
            return `  - ${vName} (ID: ${v.id}, SKU: ${sku}) | Price: ${formatPrice(priceVal)} | Stock: ${stockOnHand} on hand, ${stockAllocated} allocated`;
        });

        // Truncate description for the summary
        const descSnippet = description.length > 200 ? description.substring(0, 200) + '...' : description;

        return {
            summary: [
                `**${name}** (ID: ${product.id})`,
                `Slug: ${slug} | Status: ${enabled} | Created: ${product.createdAt}`,
                descSnippet ? `Description: ${descSnippet}` : '',
                `**Variants (${variants.length}):**`,
                ...variantLines,
            ].filter(Boolean).join('\n'),
        };
    }
}
