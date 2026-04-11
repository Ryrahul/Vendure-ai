import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, StockLocation, StockLocationService } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminStockLocationTools {
    private readonly logger = new Logger(AdminStockLocationTools.name);

    constructor(
        private connection: TransactionalConnection,
        private stockLocationService: StockLocationService,
    ) {}

    async getStockLocations(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(StockLocation);

        let qb = repo.createQueryBuilder('stockLocation');

        if (query) {
            qb = qb.where(
                '(LOWER(stockLocation.name) LIKE :term OR LOWER(stockLocation.description) LIKE :term)',
                { term: `%${query.toLowerCase()}%` },
            );
        }

        qb = qb.orderBy('stockLocation.createdAt', 'DESC').take(take);

        try {
            const locations = await qb.getMany();

            if (locations.length === 0) {
                return { summary: query ? `No stock locations found matching "${query}".` : 'No stock locations found.' };
            }

            const lines = locations.map(l => {
                const name = l.name ?? '';
                const description = l.description ?? '';
                const descSnippet = description.length > 100 ? description.substring(0, 100) + '...' : description;
                return `- **${name}** (ID: ${l.id})${descSnippet ? ` | ${descSnippet}` : ''}`;
            });

            return {
                summary: `Found ${locations.length} stock location(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching stock locations: ${e}`);
            return { summary: 'Error fetching stock locations. Please try again.' };
        }
    }

    async createStockLocation(
        ctx: RequestContext,
        args: { name: string; description?: string },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                name: args.name,
                description: args.description ?? '',
            };

            const result = await this.stockLocationService.create(ctx, input);

            return { summary: `Stock location "${result.name}" created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating stock location: ${e}`);
            return { summary: `Error creating stock location: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateStockLocation(
        ctx: RequestContext,
        args: { stockLocationId: string; name?: string; description?: string },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.stockLocationId,
            };

            if (args.name !== undefined) {
                input.name = args.name;
            }

            if (args.description !== undefined) {
                input.description = args.description;
            }

            const result = await this.stockLocationService.update(ctx, input);

            return { summary: `Stock location "${result.name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating stock location: ${e}`);
            return { summary: `Error updating stock location: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteStockLocation(
        ctx: RequestContext,
        args: { stockLocationId: string; transferToLocationId?: string },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.stockLocationId,
            };

            if (args.transferToLocationId !== undefined) {
                input.transferToLocationId = args.transferToLocationId;
            }

            const result = await this.stockLocationService.delete(ctx, input);

            if (result.result === 'DELETED') {
                const transferNote = args.transferToLocationId
                    ? ` Stock levels transferred to location ID: ${args.transferToLocationId}.`
                    : '';
                return { summary: `Stock location (ID: ${args.stockLocationId}) deleted successfully.${transferNote}` };
            }

            return { summary: `Failed to delete stock location (ID: ${args.stockLocationId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting stock location: ${e}`);
            return { summary: `Error deleting stock location: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
