import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    TaxRate,
    TaxCategory,
    Zone,
    TaxCategoryService,
    TaxRateService,
    ZoneService,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminTaxTools {
    private readonly logger = new Logger(AdminTaxTools.name);

    constructor(
        private connection: TransactionalConnection,
        private taxCategoryService: TaxCategoryService,
        private taxRateService: TaxRateService,
        private zoneService: ZoneService,
    ) {}

    // ─── Read operations ────────────────────────────────────────────────

    async getTaxRates(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 100);

        const repo = this.connection.rawConnection.getRepository(TaxRate);

        let qb = repo.createQueryBuilder('tr')
            .leftJoinAndSelect('tr.category', 'category')
            .leftJoinAndSelect('tr.zone', 'zone')
            .leftJoinAndSelect('tr.customerGroup', 'customerGroup');

        if (query) {
            qb = qb.where('(LOWER(tr.name) LIKE :term OR LOWER(category.name) LIKE :term OR LOWER(zone.name) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('tr.name', 'ASC').take(take);

        try {
            const rates = await qb.getMany();

            if (rates.length === 0) {
                return { summary: query ? `No tax rates found matching "${query}".` : 'No tax rates configured.' };
            }

            const lines = rates.map(r => {
                const name = r.name ?? '';
                const value = (r as any).value ?? 0;
                const enabled = (r as any).enabled ? 'Enabled' : 'DISABLED';
                const category = (r as any).category?.name ?? 'N/A';
                const zone = (r as any).zone?.name ?? 'N/A';
                const customerGroup = (r as any).customerGroup?.name;
                const groupStr = customerGroup ? ` | Group: ${customerGroup}` : '';
                return `- **${name}** (ID: ${r.id}) | Rate: ${value}% | ${enabled} | Category: ${category} | Zone: ${zone}${groupStr}`;
            });

            return {
                summary: `Found ${rates.length} tax rate(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching tax rates: ${e}`);
            return { summary: 'Error fetching tax rates. Please try again.' };
        }
    }

    async getTaxCategories(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 50);

        const repo = this.connection.rawConnection.getRepository(TaxCategory);

        let qb = repo.createQueryBuilder('tc');

        if (query) {
            qb = qb.where('LOWER(tc.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        qb = qb.orderBy('tc.name', 'ASC').take(take);

        try {
            const categories = await qb.getMany();

            if (categories.length === 0) {
                return { summary: query ? `No tax categories found matching "${query}".` : 'No tax categories configured.' };
            }

            const lines = categories.map(c => {
                const isDefault = (c as any).isDefault ? ' (DEFAULT)' : '';
                return `- **${c.name}** (ID: ${c.id})${isDefault}`;
            });

            return {
                summary: `Found ${categories.length} tax category/categories${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching tax categories: ${e}`);
            return { summary: 'Error fetching tax categories. Please try again.' };
        }
    }

    async getZones(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 30, 50);

        const repo = this.connection.rawConnection.getRepository(Zone);

        let qb = repo.createQueryBuilder('zone')
            .leftJoinAndSelect('zone.members', 'member')
            .leftJoinAndSelect('member.translations', 'memberTranslation');

        if (query) {
            qb = qb.where('LOWER(zone.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        qb = qb.orderBy('zone.name', 'ASC').take(take);

        try {
            const zones = await qb.getMany();

            if (zones.length === 0) {
                return { summary: query ? `No zones found matching "${query}".` : 'No zones configured.' };
            }

            const lines = zones.map(z => {
                const members = ((z as any).members ?? []) as any[];
                const memberNames = members.map((m: any) => m.translations?.[0]?.name ?? m.code ?? '').filter(Boolean);
                const memberStr = memberNames.length > 0
                    ? (memberNames.length <= 5 ? memberNames.join(', ') : `${memberNames.slice(0, 5).join(', ')} (+${memberNames.length - 5} more)`)
                    : 'no members';
                return `- **${z.name}** (ID: ${z.id}) | ${members.length} member(s): ${memberStr}`;
            });

            return {
                summary: `Found ${zones.length} zone(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching zones: ${e}`);
            return { summary: 'Error fetching zones. Please try again.' };
        }
    }

    // ─── Tax Category mutations ─────────────────────────────────────────

    async createTaxCategory(
        ctx: RequestContext,
        args: { name: string; isDefault?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                name: args.name,
                isDefault: args.isDefault ?? false,
            };

            const result = await this.taxCategoryService.create(ctx, input);

            return { summary: `Tax category "${result.name}" created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating tax category: ${e}`);
            return { summary: `Error creating tax category: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateTaxCategory(
        ctx: RequestContext,
        args: { taxCategoryId: string; name?: string; isDefault?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.taxCategoryId,
            };

            if (args.name !== undefined) {
                input.name = args.name;
            }
            if (args.isDefault !== undefined) {
                input.isDefault = args.isDefault;
            }

            const result = await this.taxCategoryService.update(ctx, input);

            return { summary: `Tax category "${result.name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating tax category: ${e}`);
            return { summary: `Error updating tax category: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteTaxCategory(
        ctx: RequestContext,
        args: { taxCategoryId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.taxCategoryService.delete(ctx, args.taxCategoryId);

            if (result.result === 'DELETED') {
                return { summary: `Tax category (ID: ${args.taxCategoryId}) deleted successfully.` };
            }

            return { summary: `Failed to delete tax category (ID: ${args.taxCategoryId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting tax category: ${e}`);
            return { summary: `Error deleting tax category: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    // ─── Tax Rate mutations ─────────────────────────────────────────────

    async createTaxRate(
        ctx: RequestContext,
        args: {
            name: string;
            value: number;
            enabled?: boolean;
            categoryId: string;
            zoneId: string;
            customerGroupId?: string;
        },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                name: args.name,
                value: args.value,
                enabled: args.enabled ?? true,
                categoryId: args.categoryId,
                zoneId: args.zoneId,
                customerGroupId: args.customerGroupId,
            };

            const result = await this.taxRateService.create(ctx, input);

            return { summary: `Tax rate "${result.name}" created successfully (ID: ${result.id}) with value ${args.value}%.` };
        } catch (e) {
            this.logger.error(`Error creating tax rate: ${e}`);
            return { summary: `Error creating tax rate: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateTaxRate(
        ctx: RequestContext,
        args: {
            taxRateId: string;
            name?: string;
            value?: number;
            enabled?: boolean;
            categoryId?: string;
            zoneId?: string;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.taxRateId,
            };

            if (args.name !== undefined) input.name = args.name;
            if (args.value !== undefined) input.value = args.value;
            if (args.enabled !== undefined) input.enabled = args.enabled;
            if (args.categoryId !== undefined) input.categoryId = args.categoryId;
            if (args.zoneId !== undefined) input.zoneId = args.zoneId;

            const result = await this.taxRateService.update(ctx, input);

            return { summary: `Tax rate "${result.name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating tax rate: ${e}`);
            return { summary: `Error updating tax rate: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteTaxRate(
        ctx: RequestContext,
        args: { taxRateId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.taxRateService.delete(ctx, args.taxRateId);

            if (result.result === 'DELETED') {
                return { summary: `Tax rate (ID: ${args.taxRateId}) deleted successfully.` };
            }

            return { summary: `Failed to delete tax rate (ID: ${args.taxRateId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting tax rate: ${e}`);
            return { summary: `Error deleting tax rate: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    // ─── Zone mutations ─────────────────────────────────────────────────

    async createZone(
        ctx: RequestContext,
        args: { name: string; memberIds?: string[] },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                name: args.name,
                memberIds: args.memberIds ?? [],
            };

            const result = await this.zoneService.create(ctx, input);

            const memberCount = args.memberIds?.length ?? 0;
            return { summary: `Zone "${result.name}" created successfully (ID: ${result.id}) with ${memberCount} member(s).` };
        } catch (e) {
            this.logger.error(`Error creating zone: ${e}`);
            return { summary: `Error creating zone: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateZone(
        ctx: RequestContext,
        args: { zoneId: string; name?: string },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.zoneId,
            };

            if (args.name !== undefined) {
                input.name = args.name;
            }

            const result = await this.zoneService.update(ctx, input);

            return { summary: `Zone "${result.name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating zone: ${e}`);
            return { summary: `Error updating zone: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteZone(
        ctx: RequestContext,
        args: { zoneId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.zoneService.delete(ctx, args.zoneId);

            if (result.result === 'DELETED') {
                return { summary: `Zone (ID: ${args.zoneId}) deleted successfully.` };
            }

            return { summary: `Failed to delete zone (ID: ${args.zoneId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting zone: ${e}`);
            return { summary: `Error deleting zone: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async addMembersToZone(
        ctx: RequestContext,
        args: { zoneId: string; memberIds: string[] },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.zoneService.addMembersToZone(ctx, {
                zoneId: args.zoneId,
                memberIds: args.memberIds,
            });

            return { summary: `Added ${args.memberIds.length} member(s) to zone "${result.name}" (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error adding members to zone: ${e}`);
            return { summary: `Error adding members to zone: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async removeMembersFromZone(
        ctx: RequestContext,
        args: { zoneId: string; memberIds: string[] },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.zoneService.removeMembersFromZone(ctx, {
                zoneId: args.zoneId,
                memberIds: args.memberIds,
            });

            return { summary: `Removed ${args.memberIds.length} member(s) from zone "${result.name}" (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error removing members from zone: ${e}`);
            return { summary: `Error removing members from zone: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
