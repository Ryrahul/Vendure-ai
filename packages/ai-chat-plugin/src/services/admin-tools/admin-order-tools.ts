import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Order } from '@vendure/core';
import { formatPrice } from '../../constants';
import { ChatResultMapper } from '../chat-result-mapper';
import type { ToolResult } from '../types';

export class AdminOrderTools {
    private readonly logger = new Logger(AdminOrderTools.name);

    constructor(
        private connection: TransactionalConnection,
        private mapper: ChatResultMapper,
    ) {}

    async searchOrders(
        ctx: RequestContext,
        args: {
            orderCode?: string;
            customerName?: string;
            state?: string;
            take?: number;
        },
    ): Promise<ToolResult> {
        const take = Math.min(args.take ?? 10, 25);

        const orderRepo = this.connection.rawConnection.getRepository(Order);
        let qb = orderRepo.createQueryBuilder('order')
            .leftJoinAndSelect('order.customer', 'customer')
            .leftJoinAndSelect('customer.user', 'user')
            .leftJoinAndSelect('order.lines', 'line')
            .leftJoinAndSelect('line.featuredAsset', 'lineFeaturedAsset')
            .leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
            .leftJoinAndSelect('variant.featuredAsset', 'variantFeaturedAsset')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoinAndSelect('product.featuredAsset', 'productFeaturedAsset')
            .leftJoinAndSelect('product.translations', 'productTranslation')
            .leftJoinAndSelect('order.fulfillments', 'fulfillment')
            .where('order.active = :active', { active: false });

        if (args.orderCode) {
            qb = qb.andWhere('order.code ILIKE :code', { code: `%${args.orderCode}%` });
        }
        if (args.customerName) {
            qb = qb.andWhere(
                '(LOWER(customer.firstName) LIKE :name OR LOWER(customer.lastName) LIKE :name OR LOWER(customer.emailAddress) LIKE :name)',
                { name: `%${args.customerName.toLowerCase()}%` },
            );
        }
        if (args.state) {
            qb = qb.andWhere('order.state = :state', { state: args.state });
        }

        qb = qb.orderBy('order.orderPlacedAt', 'DESC').take(take);

        try {
            const orders = await qb.getMany();

            if (orders.length === 0) {
                return { products: [], collections: [], summary: 'No orders found matching the criteria.' };
            }

            const mapped = this.mapper.mapOrders(orders);

            const summaryLines = orders.map(o => {
                const customer = (o as any).customer;
                const customerStr = customer
                    ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
                    : 'Guest';
                const total = (o as any).totalWithTax ?? 0;
                return `${o.code} (${o.state}, ${customerStr}, ${formatPrice(total, ctx.currencyCode)})`;
            });

            return {
                products: [],
                collections: [],
                orders: mapped,
                summary: `Found ${mapped.length} order(s): ${summaryLines.join('; ')}. Order cards are shown in the UI — keep your text brief.`,
            };
        } catch (e) {
            this.logger.error(`Error searching orders: ${e}`);
            return { products: [], collections: [], summary: 'Error searching orders. Please try again.' };
        }
    }

    async getOrderDetails(
        ctx: RequestContext,
        args: { orderId?: string; orderCode?: string },
    ): Promise<ToolResult> {
        const orderRepo = this.connection.rawConnection.getRepository(Order);

        let qb = orderRepo.createQueryBuilder('order')
            .leftJoinAndSelect('order.customer', 'customer')
            .leftJoinAndSelect('customer.user', 'user')
            .leftJoinAndSelect('order.lines', 'line')
            .leftJoinAndSelect('line.featuredAsset', 'lineFeaturedAsset')
            .leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
            .leftJoinAndSelect('variant.featuredAsset', 'variantFeaturedAsset')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoinAndSelect('product.featuredAsset', 'productFeaturedAsset')
            .leftJoinAndSelect('product.translations', 'productTranslation')
            .leftJoinAndSelect('order.fulfillments', 'fulfillment')
            .leftJoinAndSelect('order.payments', 'payment')
            .leftJoinAndSelect('order.surcharges', 'surcharge')
            .leftJoinAndSelect('order.shippingLines', 'shippingLine')
            .leftJoinAndSelect('shippingLine.shippingMethod', 'shippingMethod')
            .leftJoinAndSelect('shippingMethod.translations', 'shippingMethodTranslation')
            .where('order.active = :active', { active: false });

        if (args.orderId) {
            qb = qb.andWhere('order.id = :id', { id: args.orderId });
        } else if (args.orderCode) {
            qb = qb.andWhere('order.code = :code', { code: args.orderCode });
        } else {
            return { products: [], collections: [], summary: 'Please provide an orderId or orderCode.' };
        }

        try {
            const order = await qb.getOne();

            if (!order) {
                return { products: [], collections: [], summary: 'Order not found.' };
            }

            const mapped = this.mapper.mapOrders([order]);

            // Build detailed summary
            const customer = (order as any).customer;
            const customerStr = customer
                ? `**${customer.firstName ?? ''} ${customer.lastName ?? ''}** (${customer.emailAddress ?? 'no email'}, ID: ${customer.id})`
                : 'Guest checkout';

            const totalWithTax = (order as any).totalWithTax ?? 0;
            const subTotal = (order as any).subTotalWithTax ?? (order as any).subTotal ?? 0;
            const shippingTotal = (order as any).shippingWithTax ?? (order as any).shipping ?? 0;
            const orderPlacedAt = (order as any).orderPlacedAt
                ? new Date((order as any).orderPlacedAt).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
                : 'N/A';

            // Line items
            const lines = ((order as any).lines ?? []) as any[];
            const linesSummary = lines.map((line: any) => {
                const name = line.productVariant?.translations?.[0]?.name
                    ?? line.productVariant?.name
                    ?? 'Unknown';
                const qty = line.quantity ?? 0;
                const linePrice = line.linePriceWithTax ?? line.linePrice ?? 0;
                const unitPrice = line.unitPriceWithTax ?? line.unitPrice ?? 0;
                const sku = line.productVariant?.sku ?? '';
                return `  - ${name} (SKU: ${sku}) × ${qty} @ ${formatPrice(unitPrice, ctx.currencyCode)} = ${formatPrice(linePrice, ctx.currencyCode)}`;
            }).join('\n');

            // Payments
            const payments = ((order as any).payments ?? []) as any[];
            const paymentsSummary = payments.length > 0
                ? payments.map((p: any) => {
                    const method = p.method ?? 'Unknown';
                    const amount = p.amount ?? 0;
                    const state = p.state ?? 'Unknown';
                    const transactionId = p.transactionId ?? 'N/A';
                    return `  - ${method}: ${formatPrice(amount, ctx.currencyCode)} (${state}, Tx: ${transactionId})`;
                }).join('\n')
                : '  - No payments recorded';

            // Fulfillments
            const fulfillments = ((order as any).fulfillments ?? []) as any[];
            const fulfillmentsSummary = fulfillments.length > 0
                ? fulfillments.map((f: any) => {
                    const method = f.method ?? 'Unknown';
                    const state = f.state ?? 'Unknown';
                    const tracking = f.trackingCode ? `Tracking: ${f.trackingCode}` : 'No tracking';
                    const createdAt = f.createdAt ? new Date(f.createdAt).toISOString().split('T')[0] : '';
                    return `  - ${method} (${state}) | ${tracking}${createdAt ? ` | ${createdAt}` : ''}`;
                }).join('\n')
                : '  - No fulfillments';

            // Shipping lines
            const shippingLines = ((order as any).shippingLines ?? []) as any[];
            const shippingLinesSummary = shippingLines.length > 0
                ? shippingLines.map((sl: any) => {
                    const methodName = sl.shippingMethod?.translations?.[0]?.name ?? sl.shippingMethod?.code ?? 'Unknown';
                    const price = sl.priceWithTax ?? sl.price ?? 0;
                    return `  - ${methodName}: ${formatPrice(price, ctx.currencyCode)}`;
                }).join('\n')
                : '  - No shipping lines';

            // Surcharges
            const surcharges = ((order as any).surcharges ?? []) as any[];
            const surchargesSummary = surcharges.length > 0
                ? surcharges.map((s: any) => {
                    const desc = s.description ?? 'Surcharge';
                    const amount = s.priceWithTax ?? s.price ?? 0;
                    return `  - ${desc}: ${formatPrice(amount, ctx.currencyCode)}`;
                }).join('\n')
                : '';

            // Shipping address
            const shippingAddr = (order as any).shippingAddress;
            const shippingAddrStr = shippingAddr
                ? [
                    shippingAddr.fullName,
                    shippingAddr.company,
                    shippingAddr.streetLine1,
                    shippingAddr.streetLine2,
                    [shippingAddr.city, shippingAddr.province, shippingAddr.postalCode].filter(Boolean).join(', '),
                    shippingAddr.countryCode,
                    shippingAddr.phoneNumber ? `Phone: ${shippingAddr.phoneNumber}` : '',
                ].filter(Boolean).join(', ')
                : 'N/A';

            // Billing address
            const billingAddr = (order as any).billingAddress;
            const billingAddrStr = billingAddr
                ? [
                    billingAddr.fullName,
                    billingAddr.company,
                    billingAddr.streetLine1,
                    billingAddr.streetLine2,
                    [billingAddr.city, billingAddr.province, billingAddr.postalCode].filter(Boolean).join(', '),
                    billingAddr.countryCode,
                    billingAddr.phoneNumber ? `Phone: ${billingAddr.phoneNumber}` : '',
                ].filter(Boolean).join(', ')
                : 'N/A';

            const summaryParts = [
                `**Order ${order.code}** (ID: ${order.id})`,
                `State: **${order.state}** | Placed: ${orderPlacedAt}`,
                `Customer: ${customerStr}`,
                '',
                `**Line Items:**`,
                linesSummary || '  - No items',
                '',
                `Subtotal: ${formatPrice(subTotal, ctx.currencyCode)} | Shipping: ${formatPrice(shippingTotal, ctx.currencyCode)} | **Total: ${formatPrice(totalWithTax, ctx.currencyCode)}**`,
            ];

            if (surchargesSummary) {
                summaryParts.push('', '**Surcharges:**', surchargesSummary);
            }

            summaryParts.push(
                '',
                '**Shipping:**',
                shippingLinesSummary,
                '',
                '**Payments:**',
                paymentsSummary,
                '',
                '**Fulfillments:**',
                fulfillmentsSummary,
                '',
                `**Shipping Address:** ${shippingAddrStr}`,
                `**Billing Address:** ${billingAddrStr}`,
            );

            return {
                products: [],
                collections: [],
                orders: mapped,
                summary: summaryParts.join('\n'),
            };
        } catch (e) {
            this.logger.error(`Error getting order details: ${e}`);
            return { products: [], collections: [], summary: 'Error retrieving order details. Please try again.' };
        }
    }
}
