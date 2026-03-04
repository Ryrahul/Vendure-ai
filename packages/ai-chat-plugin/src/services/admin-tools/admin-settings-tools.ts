import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, GlobalSettings, Channel, Seller } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminSettingsTools {
    private readonly logger = new Logger(AdminSettingsTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

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
}
