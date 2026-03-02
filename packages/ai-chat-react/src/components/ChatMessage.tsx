import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { UIMessage } from 'ai';
import type { ExtractedData, VendureAiChatProps } from '../types';
import { extractDataFromMessage, getMessageText } from '../utils/extract-data';
import { cn } from '../utils/cn';
import { ProductCard } from './ProductCard';
import { CollectionBadge } from './CollectionBadge';
import { CartSummary } from './CartSummary';
import { OrderCard } from './OrderCard';

interface ChatMessageProps {
    message: UIMessage;
    onAddToCart?: VendureAiChatProps['onAddToCart'];
    onNavigate?: VendureAiChatProps['onNavigate'];
    renderProduct?: VendureAiChatProps['renderProduct'];
    renderCollection?: VendureAiChatProps['renderCollection'];
    renderCartSummary?: VendureAiChatProps['renderCartSummary'];
    renderOrder?: VendureAiChatProps['renderOrder'];
    formatPrice: (price: number) => string;
    addingToCart: string | null;
    onAddToCartClick: (variantId: string, productName: string, quantity?: number) => void;
}

export function ChatMessage({
    message,
    onNavigate,
    renderProduct,
    renderCollection,
    renderCartSummary,
    renderOrder,
    formatPrice,
    addingToCart,
    onAddToCartClick,
}: ChatMessageProps) {
    const text = getMessageText(message);
    const data: ExtractedData | null = message.role === 'assistant' ? extractDataFromMessage(message) : null;

    // Skip empty assistant messages (tool-only steps with no text)
    if (message.role === 'assistant' && !text && !data?.products.length && !data?.collections.length && !data?.activeOrder && !data?.orders?.length) {
        return null;
    }

    const isUser = message.role === 'user';

    return (
        <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted',
                )}
            >
                {message.role === 'assistant' && text ? (
                    <div className="chat-markdown max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_img]:hidden [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                        <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                ) : message.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{text}</p>
                ) : null}

                {/* Collections */}
                {data && data.collections.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {data.collections.map((c) =>
                            renderCollection ? (
                                <React.Fragment key={c.id}>{renderCollection(c)}</React.Fragment>
                            ) : (
                                <CollectionBadge key={c.id} collection={c} onNavigate={onNavigate} />
                            ),
                        )}
                    </div>
                )}

                {/* Cart summary */}
                {data?.activeOrder && data.activeOrder.lines.length > 0 && (
                    renderCartSummary ? (
                        renderCartSummary(data.activeOrder)
                    ) : (
                        <CartSummary order={data.activeOrder} formatPrice={formatPrice} />
                    )
                )}

                {/* Order history */}
                {data?.orders && data.orders.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {data.orders.map((order) =>
                            renderOrder ? (
                                <React.Fragment key={order.id}>{renderOrder(order)}</React.Fragment>
                            ) : (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    onNavigate={onNavigate}
                                    formatPrice={formatPrice}
                                />
                            ),
                        )}
                    </div>
                )}

                {/* Product cards */}
                {data && data.products.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {data.products.map((p) =>
                            renderProduct ? (
                                <React.Fragment key={p.id}>{renderProduct(p)}</React.Fragment>
                            ) : (
                                <ProductCard
                                    key={p.id}
                                    product={p}
                                    onNavigate={onNavigate}
                                    formatPrice={formatPrice}
                                    addingToCart={addingToCart === p.variantId}
                                    onAddToCart={() => onAddToCartClick(p.variantId, p.name)}
                                />
                            ),
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
