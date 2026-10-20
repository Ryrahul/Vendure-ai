import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    Product,
    ProductService,
    ProductVariantService,
    ProductOptionGroupService,
    ProductOptionService,
    TaxCategoryService,
    LanguageCode,
} from '@vendure/core';
import { formatPrice, MAX_CHAT_PRODUCTS, SIMILARITY_THRESHOLD, FALLBACK_MIN_SCORE } from '../../constants';
import { ChatResultMapper } from '../chat-result-mapper';
import { EmbeddingService } from '../embedding.service';
import { ProductEmbeddingService } from '../product-embedding.service';
import { CollectionEmbeddingService } from '../collection-embedding.service';
import type { AiChatProduct, AiChatCollection, ToolResult } from '../types';

interface AdminToolResult {
    summary: string;
}

export class AdminProductTools {
    private readonly logger = new Logger(AdminProductTools.name);

    constructor(
        private connection: TransactionalConnection,
        private mapper: ChatResultMapper,
        private fulltextSearchService: any,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private productOptionGroupService: ProductOptionGroupService,
        private productOptionService: ProductOptionService,
        private taxCategoryService: TaxCategoryService,
    ) {}

    async searchProducts(
        ctx: RequestContext,
        args: { query?: string; take?: number; includeDisabled?: boolean },
    ): Promise<ToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 10, 25);

        const repo = this.connection.rawConnection.getRepository(Product);
        let qb = repo.createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translation')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('variant.productVariantPrices', 'price', 'price.channelId = :channelId', { channelId: ctx.channelId })
            .leftJoinAndSelect('variant.stockLevels', 'stockLevel')
            .innerJoin('product.channels', 'productChannel', 'productChannel.id = :channelId', { channelId: ctx.channelId })
            .where('product.deletedAt IS NULL');

        if (query) {
            qb = qb.andWhere(
                '(LOWER(translation.name) LIKE :term OR LOWER(translation.description) LIKE :term)',
                { term: `%${query.toLowerCase()}%` },
            );
        }

        if (!args.includeDisabled) {
            qb = qb.andWhere('product.enabled = :enabled', { enabled: true });
        }

        // Also get total count for context
        const totalCount = await qb.getCount();
        const products = await qb.orderBy('product.createdAt', 'DESC').take(take).getMany();

        if (products.length === 0) {
            return { products: [], collections: [], summary: query ? `No products found matching "${query}".` : 'No products found in the store.' };
        }

        const mapped = this.mapper.mapProducts(products, ctx);

        // Build a rich summary with admin details the LLM can reference
        const summaryLines = products.map((p, i) => {
            const name = (p as any).translations?.[0]?.name ?? '';
            const enabled = p.enabled ? 'Enabled' : 'DISABLED';
            const variants = ((p as any).variants ?? []) as any[];
            const totalStock = variants.reduce((sum: number, v: any) => {
                const levels = v.stockLevels ?? [];
                return sum + levels.reduce((s: number, sl: any) => s + (sl.stockOnHand ?? 0), 0);
            }, 0);
            const variantCount = variants.length;
            const price = mapped[i]
                ? `${formatPrice(mapped[i].price, mapped[i].currencyCode ?? ctx.currencyCode)}${ctx.channel.pricesIncludeTax ? ' incl. tax' : ' excl. tax'}`
                : 'no price';
            return `"${name}" (ID: ${p.id}, ${enabled}, price ${price}, ${variantCount} variants, stock: ${totalStock})`;
        });

        const matchText = query ? `matching "${query}"` : '(most recent)';
        return {
            products: mapped,
            collections: [],
            summary: `Found ${totalCount} total product(s) ${matchText}, showing ${mapped.length}: ${summaryLines.join('; ')}. Product cards with images are shown in the UI — keep your text brief.`,
        };
    }

    async vectorSearch(
        ctx: RequestContext,
        args: { query: string },
    ): Promise<ToolResult> {
        const query = (args.query ?? '').trim();
        if (!query) {
            return { products: [], collections: [], summary: 'No search query provided.' };
        }

        const queryEmbedding = await this.embeddingService.embed(query);

        let similar = await this.productEmbeddingService.findSimilar(
            ctx, queryEmbedding, MAX_CHAT_PRODUCTS, SIMILARITY_THRESHOLD,
        );
        if (similar.length === 0) {
            const fallback = await this.productEmbeddingService.findSimilar(ctx, queryEmbedding, MAX_CHAT_PRODUCTS);
            if (fallback.length > 0 && (fallback[0]?.score ?? 0) >= FALLBACK_MIN_SCORE) {
                similar = fallback;
            }
        }

        let similarCollections = await this.collectionEmbeddingService.findSimilar(
            ctx, queryEmbedding, 3, SIMILARITY_THRESHOLD,
        );
        if (similarCollections.length === 0) {
            const fallbackColl = await this.collectionEmbeddingService.findSimilar(ctx, queryEmbedding, 3);
            if (fallbackColl.length > 0 && (fallbackColl[0]?.score ?? 0) >= FALLBACK_MIN_SCORE) {
                similarCollections = fallbackColl;
            }
        }

        const products = similar.length > 0 ? await this.mapper.loadProductsByIds(similar.map(s => s.productId), ctx) : [];
        const collections = similarCollections.length > 0 ? await this.mapper.loadCollectionsByIds(similarCollections.map(s => s.collectionId)) : [];

        return {
            products,
            collections,
            summary: products.length > 0
                ? `Found ${products.length} product(s) related to "${query}": ${products.map(p => `"${p.name}" (${formatPrice(p.price, p.currencyCode ?? ctx.currencyCode)})`).join(', ')}. Product cards with images are shown in the UI — keep your text brief.`
                : `No products found related to "${query}".`,
        };
    }

    async getProductDetails(
        ctx: RequestContext,
        args: { productId?: string; slug?: string },
    ): Promise<ToolResult> {
        const repo = this.connection.rawConnection.getRepository(Product);

        let qb = repo.createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translation')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
            .leftJoinAndSelect('variant.productVariantPrices', 'price', 'price.channelId = :channelId', { channelId: ctx.channelId })
            .leftJoinAndSelect('variant.stockLevels', 'stockLevel')
            .innerJoin('product.channels', 'productChannel', 'productChannel.id = :channelId', { channelId: ctx.channelId })
            .where('product.deletedAt IS NULL');

        if (args.productId) {
            qb = qb.andWhere('product.id = :id', { id: args.productId });
        } else if (args.slug) {
            qb = qb.andWhere('translation.slug = :slug', { slug: args.slug });
        } else {
            return { products: [], collections: [], summary: 'Please provide a productId or slug.' };
        }

        const product = await qb.getOne();
        if (!product) {
            return { products: [], collections: [], summary: `Product not found.` };
        }

        const mapped = this.mapper.mapProducts([product], ctx);
        const name = (product as any).translations?.[0]?.name ?? '';
        const description = (product as any).translations?.[0]?.description ?? '';
        const enabled = product.enabled ? 'Enabled' : 'DISABLED';
        const variants = ((product as any).variants ?? []) as any[];

        const variantSummary = variants.map((v: any) => {
            const vName = v.translations?.[0]?.name ?? '';
            const channelPrice = ChatResultMapper.channelPrice(v.productVariantPrices, ctx);
            const priceVal = channelPrice?.price ?? 0;
            const sku = v.sku ?? '';
            const levels = v.stockLevels ?? [];
            const stockOnHand = levels.reduce((s: number, sl: any) => s + (sl.stockOnHand ?? 0), 0);
            return `${vName} (SKU: ${sku}, ${formatPrice(priceVal, channelPrice?.currencyCode ?? ctx.currencyCode)}, stock: ${stockOnHand})`;
        }).join('; ');

        const descSnippet = description.length > 200 ? description.substring(0, 200) + '...' : description;

        return {
            products: mapped,
            collections: [],
            summary: `${name} (ID: ${product.id}, ${enabled}). ${descSnippet ? `Description: ${descSnippet}. ` : ''}Variants: ${variantSummary}. Product card with image shown in UI.`,
        };
    }

    // ─── Mutation methods ────────────────────────────────────────────────

    async createProduct(
        ctx: RequestContext,
        args: { name: string; slug?: string; description?: string; enabled?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const slug = args.slug ?? args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const product = await this.productService.create(ctx, {
                enabled: args.enabled ?? true,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                        slug,
                        description: args.description ?? '',
                    },
                ],
            });

            return {
                summary: `Product created successfully. ID: ${product.id}, Name: "${args.name}", Slug: "${slug}".`,
            };
        } catch (e) {
            this.logger.error(`Error creating product: ${e}`);
            return { summary: `Error creating product: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async updateProduct(
        ctx: RequestContext,
        args: { productId: string; name?: string; slug?: string; description?: string; enabled?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const input: any = { id: args.productId };
            if (args.enabled !== undefined) {
                input.enabled = args.enabled;
            }

            const translationUpdates: any = { languageCode: LanguageCode.en };
            let hasTranslation = false;
            if (args.name !== undefined) { translationUpdates.name = args.name; hasTranslation = true; }
            if (args.slug !== undefined) { translationUpdates.slug = args.slug; hasTranslation = true; }
            if (args.description !== undefined) { translationUpdates.description = args.description; hasTranslation = true; }

            if (hasTranslation) {
                input.translations = [translationUpdates];
            }

            const product = await this.productService.update(ctx, input);
            const updatedName = (product as any).translations?.[0]?.name ?? args.name ?? '';

            return {
                summary: `Product updated successfully. ID: ${product.id}, Name: "${updatedName}".`,
            };
        } catch (e) {
            this.logger.error(`Error updating product: ${e}`);
            return { summary: `Error updating product: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async deleteProduct(
        ctx: RequestContext,
        args: { productId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.productService.softDelete(ctx, args.productId as any);

            if (result.result === 'DELETED') {
                return { summary: `Product ID ${args.productId} has been successfully deleted.` };
            } else {
                return { summary: `Could not delete product ID ${args.productId}: ${result.message ?? 'Unknown error'}.` };
            }
        } catch (e) {
            this.logger.error(`Error deleting product: ${e}`);
            return { summary: `Error deleting product: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async createProductWithVariants(
        ctx: RequestContext,
        args: {
            name: string;
            slug?: string;
            description?: string;
            enabled?: boolean;
            optionGroups?: Array<{ name: string; values: string[] }>;
            variants: Array<{
                name: string;
                sku: string;
                price: number;
                stockOnHand?: number;
                optionValues?: string[];
            }>;
        },
    ): Promise<AdminToolResult> {
        try {
            // 1. Create the product
            const slug = args.slug ?? args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const product = await this.productService.create(ctx, {
                enabled: args.enabled ?? true,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                        slug,
                        description: args.description ?? '',
                    },
                ],
            });

            // 2. Get default tax category
            const taxCategories = await this.taxCategoryService.findAll(ctx, {});
            const defaultTaxCat = taxCategories.items.find(t => (t as any).isDefault) || taxCategories.items[0];
            if (!defaultTaxCat) {
                return { summary: `Product created (ID: ${product.id}) but no tax categories found. Cannot create variants without a tax category.` };
            }

            // 3. Create option groups and options, build a map of optionValue name -> optionId
            const optionValueIdMap = new Map<string, string | number>();

            if (args.optionGroups && args.optionGroups.length > 0) {
                for (const og of args.optionGroups) {
                    const ogCode = og.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

                    // Create the option group
                    const optionGroup = await this.productOptionGroupService.create(ctx, {
                        code: ogCode,
                        translations: [
                            {
                                languageCode: LanguageCode.en,
                                name: og.name,
                            },
                        ],
                    });

                    // Add option group to product
                    await this.productService.addOptionGroupToProduct(ctx, product.id, optionGroup.id);

                    // Create each option within the group
                    for (const val of og.values) {
                        const optionCode = `${ogCode}-${val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
                        const option = await this.productOptionService.create(ctx, optionGroup.id as any, {
                            code: optionCode,
                            translations: [
                                {
                                    languageCode: LanguageCode.en,
                                    name: val,
                                },
                            ],
                        });
                        optionValueIdMap.set(val.toLowerCase(), option.id);
                    }
                }
            }

            // 4. Delete the auto-created default variant
            const productWithVariants = await this.connection.rawConnection.getRepository(Product)
                .createQueryBuilder('product')
                .leftJoinAndSelect('product.variants', 'variant')
                .where('product.id = :id', { id: product.id })
                .getOne();

            const existingVariants = (productWithVariants as any)?.variants ?? [];
            for (const ev of existingVariants) {
                await this.productVariantService.softDelete(ctx, ev.id);
            }

            // 5. Create all variants
            const variantInputs = args.variants.map(v => {
                const variantSlug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

                // Map option values to option IDs
                const optionIds: Array<string | number> = [];
                if (v.optionValues) {
                    for (const ov of v.optionValues) {
                        const optId = optionValueIdMap.get(ov.toLowerCase());
                        if (optId) {
                            optionIds.push(optId);
                        }
                    }
                }

                return {
                    productId: product.id as any,
                    sku: v.sku,
                    price: v.price,
                    stockOnHand: v.stockOnHand ?? 0,
                    taxCategoryId: defaultTaxCat.id as any,
                    optionIds: optionIds as any[],
                    translations: [
                        {
                            languageCode: LanguageCode.en,
                            name: v.name,
                        },
                    ],
                };
            });

            const createdVariants = await this.productVariantService.create(ctx, variantInputs);

            return {
                summary: `Product created successfully. ID: ${product.id}, Name: "${args.name}", Slug: "${slug}". Created ${createdVariants.length} variant(s): ${createdVariants.map(v => `"${(v as any).translations?.[0]?.name ?? v.sku}" (ID: ${v.id}, SKU: ${v.sku})`).join('; ')}.`,
            };
        } catch (e) {
            this.logger.error(`Error creating product with variants: ${e}`);
            return { summary: `Error creating product with variants: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async updateProductVariant(
        ctx: RequestContext,
        args: { variantId: string; price?: number; sku?: string; stockOnHand?: number; enabled?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const input: any = { id: args.variantId };
            if (args.price !== undefined) input.price = args.price;
            if (args.sku !== undefined) input.sku = args.sku;
            if (args.stockOnHand !== undefined) input.stockOnHand = args.stockOnHand;
            if (args.enabled !== undefined) input.enabled = args.enabled;

            const [variant] = await this.productVariantService.update(ctx, [input]);
            const variantName = (variant as any).translations?.[0]?.name ?? variant.sku ?? '';

            return {
                summary: `Product variant updated successfully. ID: ${variant.id}, Name: "${variantName}", SKU: "${variant.sku}".`,
            };
        } catch (e) {
            this.logger.error(`Error updating product variant: ${e}`);
            return { summary: `Error updating product variant: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    async deleteProductVariant(
        ctx: RequestContext,
        args: { variantId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.productVariantService.softDelete(ctx, args.variantId as any);

            if (result.result === 'DELETED') {
                return { summary: `Product variant ID ${args.variantId} has been successfully deleted.` };
            } else {
                return { summary: `Could not delete product variant ID ${args.variantId}: ${result.message ?? 'Unknown error'}.` };
            }
        } catch (e) {
            this.logger.error(`Error deleting product variant: ${e}`);
            return { summary: `Error deleting product variant: ${e instanceof Error ? e.message : String(e)}` };
        }
    }
}
