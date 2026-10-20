import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { ToolSet } from 'ai';

/**
 * Tools report failures in their result (e.g. `summary: "Error deleting product: …"`)
 * rather than throwing, so a failure has to be recognised from the output.
 */
export function isFailedToolOutput(output: any): boolean {
    if (!output || typeof output !== 'object') {
        return false;
    }
    if (output.error) {
        return true;
    }
    const summary = String(output.summary ?? '').trim();
    return /^(error|could not|cannot|failed|unable|invalid|no \w+ (found|with))\b/i.test(summary);
}

class RollbackSignal {
    constructor(readonly output: unknown) {}
}

/**
 * Runs a write tool in a transaction. If it throws, or reports a failure, everything it
 * changed is rolled back — e.g. a "create product with variants" that fails on the third
 * variant leaves no half-created product behind. The tool's own result is returned.
 */
export async function runToolInTransaction<T>(
    connection: TransactionalConnection,
    ctx: RequestContext,
    run: (txCtx: RequestContext) => Promise<T>,
): Promise<T> {
    try {
        return await connection.withTransaction(ctx, async txCtx => {
            const output = await run(txCtx);
            if (isFailedToolOutput(output)) {
                throw new RollbackSignal(output);
            }
            return output;
        });
    } catch (e) {
        if (e instanceof RollbackSignal) {
            return e.output as T;
        }
        throw e;
    }
}

/**
 * Wraps the given write tools so each call runs in its own transaction. `build` must
 * create the same tool set bound to a given context (tools capture their ctx when built).
 */
export function withWriteTransactions(
    connection: TransactionalConnection,
    ctx: RequestContext,
    tools: ToolSet,
    isWrite: (toolName: string) => boolean,
    build: (txCtx: RequestContext) => ToolSet,
): ToolSet {
    const wrapped: ToolSet = {};
    for (const [name, definition] of Object.entries(tools)) {
        if (!isWrite(name) || !(definition as any).execute) {
            wrapped[name] = definition;
            continue;
        }
        wrapped[name] = {
            ...definition,
            execute: (input: unknown, options: unknown) =>
                runToolInTransaction(connection, ctx, txCtx => (build(txCtx)[name] as any).execute(input, options)),
        } as any;
    }
    return wrapped;
}

/** Shop tools that change the shopper's order. (`addToCart` is executed by the storefront itself.) */
export const SHOP_WRITE_TOOLS = new Set([
    'adjustOrderLine',
    'setShippingAddress',
    'setBillingAddress',
    'setShippingMethod',
    'applyCouponCode',
    'removeCouponCode',
]);

/** Admin tools are writes unless they only read or navigate. */
export function isAdminWriteTool(name: string): boolean {
    return !/^(get|search|vector|navigate|forecast|fetch)/.test(name);
}
