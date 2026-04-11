import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    GlobalSettings,
    Channel,
    Seller,
    Product,
    ProductVariant,
    Order,
    Customer,
    Collection,
    ShippingMethod,
    PaymentMethod,
    TaxRate,
    Promotion,
    Facet,
    Administrator,
    GlobalSettingsService,
    ChannelService,
    SellerService,
    LanguageCode,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminSettingsTools {
    private readonly logger = new Logger(AdminSettingsTools.name);

    constructor(
        private connection: TransactionalConnection,
        private globalSettingsService: GlobalSettingsService,
        private channelService: ChannelService,
        private sellerService: SellerService,
    ) {}

    // ─── Read operations ────────────────────────────────────────────────

    async getStoreOverview(ctx: RequestContext): Promise<AdminToolResult> {
        try {
            const { IsNull } = await import('typeorm');
            const repo = (entity: any) => this.connection.rawConnection.getRepository(entity);
            const nd = { deletedAt: IsNull() } as any;

            const safeCount = async (entity: any, where?: any) => {
                try {
                    return await repo(entity).count(where ? { where } : {});
                } catch {
                    return await repo(entity).count();
                }
            };

            const [products, variants, orders, customers, collections, shipping, payment, taxRates, promotions, facets, admins] =
                await Promise.all([
                    safeCount(Product, nd),
                    safeCount(ProductVariant, nd),
                    safeCount(Order, { active: false }),
                    safeCount(Customer, nd),
                    safeCount(Collection),
                    safeCount(ShippingMethod, nd),
                    safeCount(PaymentMethod),
                    safeCount(TaxRate),
                    safeCount(Promotion, nd),
                    safeCount(Facet),
                    safeCount(Administrator, nd),
                ]);

            return {
                summary: [
                    `**Store Overview:**`,
                    `- **Products:** ${products} (${variants} variants)`,
                    `- **Collections:** ${collections}`,
                    `- **Customers:** ${customers}`,
                    `- **Orders:** ${orders}`,
                    `- **Shipping Methods:** ${shipping}`,
                    `- **Payment Methods:** ${payment}`,
                    `- **Tax Rates:** ${taxRates}`,
                    `- **Promotions:** ${promotions}`,
                    `- **Facets:** ${facets}`,
                    `- **Administrators:** ${admins}`,
                ].join('\n'),
            };
        } catch (e) {
            this.logger.error(`Error getting store overview: ${e}`);
            return { summary: `Error getting store overview: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async getGlobalSettings(
        ctx: RequestContext,
    ): Promise<AdminToolResult> {
        const repo = this.connection.rawConnection.getRepository(GlobalSettings);

        try {
            const settings = await repo.findOne({ where: {} });

            if (!settings) {
                return { summary: 'No global settings found.' };
            }

            const trackInventory = (settings as any).trackInventory ?? 'N/A';
            const outOfStockThreshold = (settings as any).outOfStockThreshold ?? 'N/A';
            const availableLanguages = (settings as any).availableLanguages ?? [];
            const customFields = (settings as any).customFields ?? {};
            const customFieldKeys = Object.keys(customFields).filter(k => customFields[k] !== null && customFields[k] !== undefined);

            let summary = `**Global Settings** (ID: ${settings.id}):\n`;
            summary += `- Track Inventory: ${trackInventory}\n`;
            summary += `- Out of Stock Threshold: ${outOfStockThreshold}\n`;
            summary += `- Available Languages: ${availableLanguages.length > 0 ? availableLanguages.join(', ') : 'none set'}\n`;

            if (customFieldKeys.length > 0) {
                summary += `- Custom Fields: ${customFieldKeys.map(k => `${k}: ${customFields[k]}`).join(', ')}`;
            }

            return { summary };
        } catch (e) {
            this.logger.error(`Error fetching global settings: ${e}`);
            return { summary: 'Error fetching global settings. Please try again.' };
        }
    }

    async getChannels(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Channel);

        let qb = repo.createQueryBuilder('channel')
            .leftJoinAndSelect('channel.defaultTaxZone', 'defaultTaxZone')
            .leftJoinAndSelect('channel.defaultShippingZone', 'defaultShippingZone')
            .leftJoinAndSelect('channel.seller', 'seller');

        if (query) {
            qb = qb.where('(LOWER(channel.code) LIKE :term OR LOWER(channel.description) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('channel.createdAt', 'ASC').take(take);

        try {
            const channels = await qb.getMany();

            if (channels.length === 0) {
                return { summary: query ? `No channels found matching "${query}".` : 'No channels found.' };
            }

            const lines = channels.map(c => {
                const code = (c as any).code ?? '';
                const token = (c as any).token ?? '';
                const description = (c as any).description ?? '';
                const defaultLang = (c as any).defaultLanguageCode ?? 'N/A';
                const defaultCurrency = (c as any).defaultCurrencyCode ?? 'N/A';
                const availableCurrencies = ((c as any).availableCurrencyCodes ?? []).join(', ') || defaultCurrency;
                const pricesIncludeTax = (c as any).pricesIncludeTax ? 'Yes' : 'No';
                const defaultTaxZone = (c as any).defaultTaxZone?.name ?? 'N/A';
                const defaultShippingZone = (c as any).defaultShippingZone?.name ?? 'N/A';
                const seller = (c as any).seller?.name ?? 'none';
                const trackInventory = (c as any).trackInventory ? 'Yes' : 'No';
                const descSnippet = description.length > 80 ? description.substring(0, 80) + '...' : description;
                return `- **${code}** (ID: ${c.id}) | Token: \`${token}\` | Language: ${defaultLang} | Currency: ${defaultCurrency} (${availableCurrencies}) | Prices incl. tax: ${pricesIncludeTax} | Tax Zone: ${defaultTaxZone} | Shipping Zone: ${defaultShippingZone} | Seller: ${seller} | Track Inventory: ${trackInventory}${descSnippet ? ` | ${descSnippet}` : ''}`;
            });

            return {
                summary: `Found ${channels.length} channel(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching channels: ${e}`);
            return { summary: 'Error fetching channels. Please try again.' };
        }
    }

    async getSellers(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Seller);

        let qb = repo.createQueryBuilder('seller')
            .where('seller.deletedAt IS NULL');

        if (query) {
            qb = qb.andWhere('LOWER(seller.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        qb = qb.orderBy('seller.name', 'ASC').take(take);

        try {
            const sellers = await qb.getMany();

            if (sellers.length === 0) {
                return { summary: query ? `No sellers found matching "${query}".` : 'No sellers configured.' };
            }

            const lines = sellers.map(s => {
                const created = s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : 'N/A';
                return `- **${(s as any).name}** (ID: ${s.id}) | Created: ${created}`;
            });

            return {
                summary: `Found ${sellers.length} seller(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching sellers: ${e}`);
            return { summary: 'Error fetching sellers. Please try again.' };
        }
    }

    // ─── Global Settings mutations ──────────────────────────────────────

    async updateGlobalSettings(
        ctx: RequestContext,
        args: {
            trackInventory?: boolean;
            outOfStockThreshold?: number;
            availableLanguages?: string[];
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {};

            if (args.trackInventory !== undefined) input.trackInventory = args.trackInventory;
            if (args.outOfStockThreshold !== undefined) input.outOfStockThreshold = args.outOfStockThreshold;
            if (args.availableLanguages !== undefined) input.availableLanguages = args.availableLanguages;

            const result = await this.globalSettingsService.updateSettings(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update global settings: ${(result as any).message ?? 'Unknown error'}` };
            }

            const changes: string[] = [];
            if (args.trackInventory !== undefined) changes.push(`trackInventory=${args.trackInventory}`);
            if (args.outOfStockThreshold !== undefined) changes.push(`outOfStockThreshold=${args.outOfStockThreshold}`);
            if (args.availableLanguages !== undefined) changes.push(`availableLanguages=[${args.availableLanguages.join(', ')}]`);

            return { summary: `Global settings updated successfully: ${changes.join(', ')}.` };
        } catch (e) {
            this.logger.error(`Error updating global settings: ${e}`);
            return { summary: `Error updating global settings: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    // ─── Channel mutations ──────────────────────────────────────────────

    async createChannel(
        ctx: RequestContext,
        args: {
            code: string;
            token: string;
            defaultLanguageCode: string;
            defaultCurrencyCode: string;
            pricesIncludeTax: boolean;
            defaultTaxZoneId?: string;
            defaultShippingZoneId?: string;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                code: args.code,
                token: args.token,
                defaultLanguageCode: args.defaultLanguageCode as LanguageCode,
                availableLanguageCodes: [args.defaultLanguageCode as LanguageCode],
                defaultCurrencyCode: args.defaultCurrencyCode,
                availableCurrencyCodes: [args.defaultCurrencyCode],
                pricesIncludeTax: args.pricesIncludeTax,
            };

            if (args.defaultTaxZoneId !== undefined) input.defaultTaxZoneId = args.defaultTaxZoneId;
            if (args.defaultShippingZoneId !== undefined) input.defaultShippingZoneId = args.defaultShippingZoneId;

            const result = await this.channelService.create(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to create channel: ${(result as any).message ?? 'Unknown error'}` };
            }

            const code = (result as any).code ?? args.code;
            return { summary: `Channel "${code}" created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating channel: ${e}`);
            return { summary: `Error creating channel: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateChannel(
        ctx: RequestContext,
        args: {
            channelId: string;
            code?: string;
            defaultLanguageCode?: string;
            defaultCurrencyCode?: string;
            pricesIncludeTax?: boolean;
            defaultTaxZoneId?: string;
            defaultShippingZoneId?: string;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.channelId,
            };

            if (args.code !== undefined) input.code = args.code;
            if (args.defaultLanguageCode !== undefined) input.defaultLanguageCode = args.defaultLanguageCode as LanguageCode;
            if (args.defaultCurrencyCode !== undefined) input.defaultCurrencyCode = args.defaultCurrencyCode as any;
            if (args.pricesIncludeTax !== undefined) input.pricesIncludeTax = args.pricesIncludeTax;
            if (args.defaultTaxZoneId !== undefined) input.defaultTaxZoneId = args.defaultTaxZoneId;
            if (args.defaultShippingZoneId !== undefined) input.defaultShippingZoneId = args.defaultShippingZoneId;

            const result = await this.channelService.update(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update channel: ${(result as any).message ?? 'Unknown error'}` };
            }

            const code = (result as any).code ?? '';
            return { summary: `Channel "${code}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating channel: ${e}`);
            return { summary: `Error updating channel: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteChannel(
        ctx: RequestContext,
        args: { channelId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.channelService.delete(ctx, args.channelId);

            if (result.result === 'DELETED') {
                return { summary: `Channel (ID: ${args.channelId}) deleted successfully.` };
            }

            return { summary: `Failed to delete channel (ID: ${args.channelId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting channel: ${e}`);
            return { summary: `Error deleting channel: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    // ─── Seller mutations ───────────────────────────────────────────────

    async createSeller(
        ctx: RequestContext,
        args: { name: string },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                name: args.name,
            };

            const result = await this.sellerService.create(ctx, input);

            const name = (result as any).name ?? args.name;
            return { summary: `Seller "${name}" created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating seller: ${e}`);
            return { summary: `Error creating seller: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateSeller(
        ctx: RequestContext,
        args: { sellerId: string; name?: string },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.sellerId,
            };

            if (args.name !== undefined) {
                input.name = args.name;
            }

            const result = await this.sellerService.update(ctx, input);

            const name = (result as any).name ?? '';
            return { summary: `Seller "${name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating seller: ${e}`);
            return { summary: `Error updating seller: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteSeller(
        ctx: RequestContext,
        args: { sellerId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.sellerService.delete(ctx, args.sellerId);

            if (result.result === 'DELETED') {
                return { summary: `Seller (ID: ${args.sellerId}) deleted successfully.` };
            }

            return { summary: `Failed to delete seller (ID: ${args.sellerId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting seller: ${e}`);
            return { summary: `Error deleting seller: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
