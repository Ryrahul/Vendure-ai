import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    ShippingMethod,
    ShippingMethodService,
    LanguageCode,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminShippingTools {
    private readonly logger = new Logger(AdminShippingTools.name);

    constructor(
        private connection: TransactionalConnection,
        private shippingMethodService: ShippingMethodService,
    ) {}

    async getShippingMethods(
        ctx: RequestContext,
        args: { query?: string; take?: number; includeDeleted?: boolean },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(ShippingMethod);

        let qb = repo.createQueryBuilder('sm')
            .leftJoinAndSelect('sm.translations', 'translation')
            .leftJoinAndSelect('sm.channels', 'channel');

        if (!args.includeDeleted) {
            qb = qb.where('sm.deletedAt IS NULL');
        }

        if (query) {
            qb = qb.andWhere('(LOWER(translation.name) LIKE :term OR LOWER(sm.code) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('sm.createdAt', 'DESC').take(take);

        try {
            const methods = await qb.getMany();

            if (methods.length === 0) {
                return { summary: query ? `No shipping methods found matching "${query}".` : 'No shipping methods configured.' };
            }

            const lines = methods.map(m => {
                const name = (m as any).translations?.[0]?.name ?? '';
                const description = (m as any).translations?.[0]?.description ?? '';
                const code = (m as any).code ?? '';
                const fulfillmentHandler = (m as any).fulfillmentHandlerCode ?? 'N/A';
                const deleted = (m as any).deletedAt ? ' (DELETED)' : '';
                const channels = ((m as any).channels ?? []).map((c: any) => c.code).join(', ') || 'none';
                const descSnippet = description.length > 100 ? description.substring(0, 100) + '...' : description;
                return `- **${name}** (ID: ${m.id}) | Code: \`${code}\` | Fulfillment: ${fulfillmentHandler} | Channels: ${channels}${deleted}${descSnippet ? ` | ${descSnippet}` : ''}`;
            });

            return {
                summary: `Found ${methods.length} shipping method(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching shipping methods: ${e}`);
            return { summary: 'Error fetching shipping methods. Please try again.' };
        }
    }

    async createShippingMethod(
        ctx: RequestContext,
        args: {
            name: string;
            code: string;
            description?: string;
            fulfillmentHandler: string;
            checkerCode?: string;
            checkerArgs?: Record<string, string>;
            calculatorCode?: string;
            calculatorArgs?: Record<string, string>;
        },
    ): Promise<AdminToolResult> {
        try {
            const checkerCode = args.checkerCode ?? 'default-shipping-eligibility-checker';
            const checkerArgEntries = args.checkerArgs
                ? Object.entries(args.checkerArgs)
                : [{ name: 'orderMinimum', value: '0' }] as any;
            const checkerArguments = Array.isArray(checkerArgEntries[0])
                ? checkerArgEntries.map(([name, value]: [string, string]) => ({ name, value }))
                : checkerArgEntries;

            const calculatorCode = args.calculatorCode ?? 'default-shipping-calculator';
            const calculatorArguments = args.calculatorArgs
                ? Object.entries(args.calculatorArgs).map(([name, value]) => ({ name, value }))
                : [];

            // If using default checker without explicit args, provide default orderMinimum
            const finalCheckerArguments = args.checkerArgs
                ? Object.entries(args.checkerArgs).map(([name, value]) => ({ name, value }))
                : [{ name: 'orderMinimum', value: '0' }];

            const input = {
                code: args.code,
                fulfillmentHandler: args.fulfillmentHandler,
                checker: {
                    code: checkerCode,
                    arguments: finalCheckerArguments,
                },
                calculator: {
                    code: calculatorCode,
                    arguments: calculatorArguments,
                },
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                        description: args.description ?? '',
                    },
                ],
            };

            const result = await this.shippingMethodService.create(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to create shipping method: ${(result as any).message ?? 'Unknown error'}` };
            }

            return {
                summary: `Shipping method "${args.name}" (ID: ${result.id}, code: "${args.code}") created successfully with fulfillment handler "${args.fulfillmentHandler}".`,
            };
        } catch (e) {
            this.logger.error(`Error creating shipping method: ${e}`);
            return { summary: `Error creating shipping method: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateShippingMethod(
        ctx: RequestContext,
        args: {
            shippingMethodId: string;
            name?: string;
            code?: string;
            description?: string;
            fulfillmentHandler?: string;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.shippingMethodId,
            };

            if (args.name !== undefined || args.description !== undefined) {
                input.translations = [
                    {
                        languageCode: LanguageCode.en,
                        ...(args.name !== undefined && { name: args.name }),
                        ...(args.description !== undefined && { description: args.description }),
                    },
                ];
            }

            if (args.code !== undefined) {
                input.code = args.code;
            }

            if (args.fulfillmentHandler !== undefined) {
                input.fulfillmentHandler = args.fulfillmentHandler;
            }

            const result = await this.shippingMethodService.update(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update shipping method: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Shipping method "${name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating shipping method: ${e}`);
            return { summary: `Error updating shipping method: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteShippingMethod(
        ctx: RequestContext,
        args: { shippingMethodId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.shippingMethodService.softDelete(ctx, args.shippingMethodId);

            if (result.result === 'DELETED') {
                return { summary: `Shipping method (ID: ${args.shippingMethodId}) soft-deleted successfully.` };
            }

            return { summary: `Failed to delete shipping method (ID: ${args.shippingMethodId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting shipping method: ${e}`);
            return { summary: `Error deleting shipping method: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
