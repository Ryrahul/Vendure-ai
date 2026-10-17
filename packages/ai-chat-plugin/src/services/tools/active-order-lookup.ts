import { ActiveOrderService, Order, RequestContext } from '@vendure/core';

/**
 * Finds the shopper's active order the same way the Shop API's `activeOrder` query does:
 * via ActiveOrderService, so it works for guests (session-based carts) as well as
 * logged-in customers, and honours any custom ActiveOrderStrategy.
 *
 * A guest's cart lives on their Shop API session, so the chat request must carry the
 * same session (the storefront's auth token or session cookie).
 */
export class ActiveOrderLookup {
    constructor(private activeOrderService: ActiveOrderService) {}

    async find(ctx: RequestContext): Promise<Order | undefined> {
        if (!ctx.session) {
            return undefined;
        }
        return this.activeOrderService.getActiveOrder(ctx, undefined);
    }
}

/** Shown when there is no cart for this shopper (no session yet, or nothing added). */
export const NO_CART_MESSAGE =
    'No cart found for this shopper yet. Add a product to the cart first (the cart belongs to their storefront session).';
