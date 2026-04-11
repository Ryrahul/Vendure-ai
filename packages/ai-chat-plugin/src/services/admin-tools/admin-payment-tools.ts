import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    PaymentMethod,
    PaymentMethodService,
    LanguageCode,
    isGraphQlErrorResult,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminPaymentTools {
    private readonly logger = new Logger(AdminPaymentTools.name);

    constructor(
        private connection: TransactionalConnection,
        private paymentMethodService: PaymentMethodService,
    ) {}

    async getPaymentMethods(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(PaymentMethod);

        let qb = repo.createQueryBuilder('pm')
            .leftJoinAndSelect('pm.translations', 'translation')
            .leftJoinAndSelect('pm.channels', 'channel');

        if (query) {
            qb = qb.where('(LOWER(translation.name) LIKE :term OR LOWER(pm.code) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('pm.createdAt', 'DESC').take(take);

        try {
            const methods = await qb.getMany();

            if (methods.length === 0) {
                return { summary: query ? `No payment methods found matching "${query}".` : 'No payment methods configured.' };
            }

            const lines = methods.map(m => {
                const name = (m as any).translations?.[0]?.name ?? '';
                const description = (m as any).translations?.[0]?.description ?? '';
                const code = (m as any).code ?? '';
                const enabled = (m as any).enabled ? 'Enabled' : 'DISABLED';
                const handler = (m as any).handler?.code ?? 'N/A';
                const checker = (m as any).checker?.code ?? 'none';
                const channels = ((m as any).channels ?? []).map((c: any) => c.code).join(', ') || 'none';
                const descSnippet = description.length > 100 ? description.substring(0, 100) + '...' : description;
                return `- **${name}** (ID: ${m.id}) | Code: \`${code}\` | ${enabled} | Handler: ${handler} | Checker: ${checker} | Channels: ${channels}${descSnippet ? ` | ${descSnippet}` : ''}`;
            });

            return {
                summary: `Found ${methods.length} payment method(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching payment methods: ${e}`);
            return { summary: 'Error fetching payment methods. Please try again.' };
        }
    }

    async createPaymentMethod(
        ctx: RequestContext,
        args: {
            name: string;
            code: string;
            description?: string;
            enabled?: boolean;
            handlerCode: string;
            handlerArgs?: Record<string, string>;
            checkerCode?: string;
            checkerArgs?: Record<string, string>;
        },
    ): Promise<AdminToolResult> {
        try {
            const handler = {
                code: args.handlerCode,
                arguments: args.handlerArgs
                    ? Object.entries(args.handlerArgs).map(([name, value]) => ({ name, value }))
                    : [],
            };

            const input: any = {
                code: args.code,
                enabled: args.enabled ?? true,
                handler,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: args.name,
                        description: args.description ?? '',
                    },
                ],
            };

            if (args.checkerCode) {
                input.checker = {
                    code: args.checkerCode,
                    arguments: args.checkerArgs
                        ? Object.entries(args.checkerArgs).map(([name, value]) => ({ name, value }))
                        : [],
                };
            }

            const result = await this.paymentMethodService.create(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to create payment method: ${(result as any).message ?? 'Unknown error'}` };
            }

            const enabledStr = (args.enabled ?? true) ? 'enabled' : 'disabled';
            return {
                summary: `Payment method "${args.name}" (ID: ${result.id}, code: "${args.code}") created successfully (${enabledStr}, handler: "${args.handlerCode}").`,
            };
        } catch (e) {
            this.logger.error(`Error creating payment method: ${e}`);
            return { summary: `Error creating payment method: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updatePaymentMethod(
        ctx: RequestContext,
        args: {
            paymentMethodId: string;
            name?: string;
            code?: string;
            description?: string;
            enabled?: boolean;
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.paymentMethodId,
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

            if (args.enabled !== undefined) {
                input.enabled = args.enabled;
            }

            const result = await this.paymentMethodService.update(ctx, input);

            if (isGraphQlErrorResult(result)) {
                return { summary: `Failed to update payment method: ${(result as any).message ?? 'Unknown error'}` };
            }

            const name = (result as any).translations?.[0]?.name ?? '';
            return { summary: `Payment method "${name}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating payment method: ${e}`);
            return { summary: `Error updating payment method: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deletePaymentMethod(
        ctx: RequestContext,
        args: { paymentMethodId: string; force?: boolean },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.paymentMethodService.delete(ctx, args.paymentMethodId, args.force ?? false);

            if (result.result === 'DELETED') {
                return { summary: `Payment method (ID: ${args.paymentMethodId}) deleted successfully.` };
            }

            return { summary: `Failed to delete payment method (ID: ${args.paymentMethodId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting payment method: ${e}`);
            return { summary: `Error deleting payment method: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
