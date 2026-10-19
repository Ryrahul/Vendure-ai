import { Product, ProductVariant, Collection, Order, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import type { AiChatProduct, AiChatCollection, AiChatOrder, AiChatOrderLine, AiActiveOrder, AiCartLine } from './types';

export class ChatResultMapper {
    constructor(
        private connection: TransactionalConnection,
        private assetUrlPrefix: string,
    ) {}

    resolveAssetUrl(previewPath: string | null): string | null {
        if (!previewPath) return null;
        if (previewPath.startsWith('http://') || previewPath.startsWith('https://')) {
            return previewPath;
        }
        return `${this.assetUrlPrefix}${previewPath.replace(/^\//, '')}`;
    }

    mapOrders(orders: Order[]): AiChatOrder[] {
        return orders.map(order => {
            const lines: AiChatOrderLine[] = ((order as any).lines ?? []).map((line: any) => {
                const name = line.productVariant?.translations?.[0]?.name
                    || line.productVariant?.name
                    || 'Unknown product';
                // Resolve product image: prefer order line's featured asset, then variant's, then product's
                const imagePreview = line.featuredAsset?.preview
                    ?? line.productVariant?.featuredAsset?.preview
                    ?? line.productVariant?.product?.featuredAsset?.preview
                    ?? null;
                // Resolve slug from product translations or product itself
                const slug = line.productVariant?.product?.translations?.[0]?.slug
                    ?? line.productVariant?.product?.slug
                    ?? '';
                return {
                    productName: name,
                    quantity: line.quantity ?? 0,
                    slug: String(slug),
                    variantId: String(line.productVariant?.id ?? ''),
                    image: this.resolveAssetUrl(imagePreview),
                    linePriceWithTax: line.linePriceWithTax ?? line.linePrice ?? 0,
                };
            });

            return {
                id: String(order.id),
                code: order.code,
                state: order.state,
                total: (order as any).totalWithTax ?? (order as any).total ?? 0,
                currencyCode: (order as any).currencyCode,
                orderPlacedAt: (order as any).orderPlacedAt ? new Date((order as any).orderPlacedAt).toISOString() : null,
                lines,
                fulfillments: ((order as any).fulfillments ?? []).map((f: any) => ({
                    state: f.state ?? 'Unknown',
                    method: f.method ?? 'Unknown',
                    trackingCode: f.trackingCode ?? null,
                })),
            };
        });
    }

    mapActiveOrder(order: Order): AiActiveOrder {
        const lines: AiCartLine[] = ((order as any).lines ?? []).map((line: any) => {
            const name = line.productVariant?.translations?.[0]?.name
                || line.productVariant?.name
                || 'Unknown product';
            return {
                orderLineId: String(line.id),
                productName: name,
                variantId: String(line.productVariant?.id ?? ''),
                quantity: line.quantity ?? 0,
                linePriceWithTax: line.linePriceWithTax ?? line.linePrice ?? 0,
            };
        });

        return {
            id: String(order.id),
            code: order.code,
            totalQuantity: (order as any).totalQuantity ?? lines.reduce((sum: number, l: AiCartLine) => sum + l.quantity, 0),
            totalWithTax: (order as any).totalWithTax ?? 0,
            currencyCode: (order as any).currencyCode,
            lines,
        };
    }

    mapProducts(products: Product[]): AiChatProduct[] {
        const result: AiChatProduct[] = [];
        for (const p of products) {
            const translations = (p as Product & { translations?: { name?: string; slug?: string }[] }).translations;
            const name = translations?.[0]?.name ?? (p as { name?: string }).name ?? '';
            const slug = translations?.[0]?.slug ?? (p as { slug?: string }).slug ?? '';
            const variant = (p as Product & { variants?: ProductVariant[] }).variants?.[0];
            const prices = (variant as ProductVariant & { productVariantPrices?: { price: number }[] })?.productVariantPrices;
            const priceValue = prices?.[0]?.price ?? (variant as { price?: number })?.price ?? 0;
            const asset = (p as Product & { featuredAsset?: { preview?: string } }).featuredAsset;
            const image = asset?.preview ?? null;
            const variantId = variant ? String(variant.id) : '';
            result.push({
                id: String(p.id),
                name: String(name),
                slug: String(slug),
                price: Number(priceValue),
                image: this.resolveAssetUrl(image),
                variantId,
            });
        }
        return result;
    }

    mapCollections(collections: Collection[]): AiChatCollection[] {
        return collections
            .filter(c => {
                const isRoot = (c as Collection & { isRoot?: boolean }).isRoot;
                if (isRoot) return false;
                const t = (c as Collection & { translations?: { name?: string; slug?: string }[] }).translations;
                const slug = t?.[0]?.slug ?? '';
                const name = t?.[0]?.name ?? '';
                if (slug.includes('__root') || name.includes('__root')) return false;
                if (!name || !slug) return false;
                return true;
            })
            .map(c => {
                const t = (c as Collection & { translations?: { name?: string; slug?: string }[] }).translations;
                return {
                    id: String(c.id),
                    name: String(t?.[0]?.name ?? ''),
                    slug: String(t?.[0]?.slug ?? ''),
                };
            });
    }

    async loadProductsByIds(productIds: number[]): Promise<AiChatProduct[]> {
        if (productIds.length === 0) return [];
        const repo = this.connection.rawConnection.getRepository(Product);
        const list = await repo.find({
            where: { id: In(productIds) },
            relations: ['variants', 'variants.productVariantPrices', 'featuredAsset', 'translations'],
        });
        const byId = new Map(list.map(p => [p.id, p]));
        return this.mapProducts(productIds.map(id => byId.get(id)).filter((p): p is Product => p != null));
    }

    async loadCollectionsByIds(collectionIds: number[]): Promise<AiChatCollection[]> {
        if (collectionIds.length === 0) return [];
        const repo = this.connection.rawConnection.getRepository(Collection);
        const list = await repo.find({
            where: { id: In(collectionIds) },
            relations: ['translations'],
        });
        return this.mapCollections(list);
    }

    mergeProducts(existing: AiChatProduct[], incoming: AiChatProduct[]): AiChatProduct[] {
        const ids = new Set(existing.map(p => p.id));
        const merged = [...existing];
        for (const p of incoming) {
            if (!ids.has(p.id)) { merged.push(p); ids.add(p.id); }
        }
        return merged;
    }

    mergeCollections(existing: AiChatCollection[], incoming: AiChatCollection[]): AiChatCollection[] {
        const ids = new Set(existing.map(c => c.id));
        const merged = [...existing];
        for (const c of incoming) {
            if (!ids.has(c.id)) { merged.push(c); ids.add(c.id); }
        }
        return merged;
    }
}
