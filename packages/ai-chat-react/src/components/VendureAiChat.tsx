import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Store, Sparkles, Send, Loader2 } from 'lucide-react';
import type { VendureAiChatProps } from '../types';
import { useVendureChat } from '../hooks/use-vendure-chat';
import { extractDataFromMessage } from '../utils/extract-data';
import { cn } from '../utils/cn';
import { ChatMessage } from './ChatMessage';

const DEFAULT_QUICK_ACTIONS = [
    'What do you sell?',
    'Show me your collections',
    'Help me find a gift',
    "What's popular?",
];

const DEFAULT_WELCOME =
    "Hi there! I'm your shopping assistant. I can help you find products, browse collections, check prices, and even add items to your cart. What are you looking for today?";

/**
 * Drop-in AI shopping assistant chat component for Vendure stores.
 *
 * Uses Tailwind CSS for styling. Works with any React framework
 * (Next.js, Remix, Vite, CRA, etc.).
 */
export function VendureAiChat({
    vendureUrl,
    authToken,
    chatEndpoint,
    channelToken,
    position = 'bottom-right',
    title = 'Shopping Assistant',
    placeholder = 'Ask about products, collections, prices...',
    welcomeMessage = DEFAULT_WELCOME,
    quickActions = DEFAULT_QUICK_ACTIONS,
    onAddToCart,
    onCartUpdate,
    onCouponAction,
    onNavigate,
    renderProduct,
    renderCollection,
    renderCartSummary,
    renderOrder,
    renderPromotion,
    className,
    formatPrice = formatChatPrice,
}: VendureAiChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [addingToCart, setAddingToCart] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const processedActionsRef = useRef<Set<string>>(new Set());

    const { messages, sendMessage, status, isLoading } = useVendureChat({
        vendureUrl,
        authToken,
        chatEndpoint,
        channelToken,
    });

    // Auto-scroll on new messages
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, status]);

    // Process add-to-cart and cart-update actions when stream finishes.
    // Scans ALL assistant messages (not just the last) because multi-step tool calls
    // may produce multiple assistant messages — the addToCartAction might be in an
    // earlier step message while the text response is in the last one.
    useEffect(() => {
        if (status !== 'ready') return;

        for (const msg of messages) {
            if (msg.role !== 'assistant') continue;

            const data = extractDataFromMessage(msg);

            // Notify when cart state changes (add, adjust, checkout)
            if (data.activeOrder && onCartUpdate && !processedActionsRef.current.has(msg.id + '-cartupdate')) {
                processedActionsRef.current.add(msg.id + '-cartupdate');
                onCartUpdate(data.activeOrder);
            }

            if (data.addToCartAction && !processedActionsRef.current.has(msg.id + '-cart')) {
                processedActionsRef.current.add(msg.id + '-cart');
                handleAddToCartAction(
                    data.addToCartAction.variantId,
                    data.addToCartAction.productName ?? 'Item',
                    data.addToCartAction.quantity,
                );
            }

            // Notify when a coupon code is applied or removed
            if (data.applyCouponAction && onCouponAction && !processedActionsRef.current.has(msg.id + '-coupon')) {
                processedActionsRef.current.add(msg.id + '-coupon');
                onCouponAction(data.applyCouponAction.couponCode, data.applyCouponAction.applied);
            }
        }
    }, [messages, status]);

    async function handleAddToCartAction(variantId: string, productName: string, quantity = 1) {
        if (addingToCart || !onAddToCart) return;
        setAddingToCart(variantId);
        try {
            await onAddToCart(variantId, quantity, productName);
        } catch {
            // Consumer handles errors
        } finally {
            setAddingToCart(null);
        }
    }

    async function handleAddToCartClick(variantId: string, productName: string, quantity = 1) {
        if (!onAddToCart) return;
        setAddingToCart(variantId);
        try {
            await onAddToCart(variantId, quantity, productName);
        } catch {
            // Consumer handles errors
        } finally {
            setAddingToCart(null);
        }
    }

    async function handleSend(text: string) {
        if (!text.trim() || isLoading) return;
        setInputValue('');
        await sendMessage(text.trim());
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        handleSend(inputValue);
    }

    const isInline = position === 'inline';

    // ── Inline mode: render panel only ──
    if (isInline) {
        return (
            <div className={cn('flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background', className)}>
                {renderPanel()}
            </div>
        );
    }

    // ── Floating mode: FAB + panel ──
    return (
        <div
            className={cn(
                'fixed z-[9999]',
                position === 'bottom-right' ? 'bottom-6 right-6' : 'bottom-6 left-6',
                className,
            )}
        >
            {isOpen && (
                <>
                    {/* Backdrop — click to close */}
                    <div className="fixed inset-0 z-[-1]" onClick={() => setIsOpen(false)} />

                    {/* Panel */}
                    <div
                        className={cn(
                            'absolute bottom-[4.5rem] flex h-[85vh] max-h-[750px] w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-xl animate-in fade-in slide-in-from-bottom-2',
                            position === 'bottom-right' ? 'right-0' : 'left-0',
                        )}
                    >
                        {renderPanel()}
                    </div>
                </>
            )}

            {/* FAB */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90"
                aria-label={isOpen ? 'Close chat' : 'Open chat'}
            >
                {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
            </button>
        </div>
    );

    function renderPanel() {
        return (
            <>
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b p-4">
                    <h2 className="flex items-center gap-2 text-left font-semibold">
                        <Store className="h-5 w-5 text-primary" />
                        {title}
                    </h2>
                    {!isInline && (
                        <button
                            onClick={() => setIsOpen(false)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Messages area */}
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="space-y-4">
                        {/* Empty state */}
                        {messages.length === 0 && (
                            <div className="space-y-4 py-4">
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm">
                                        <p>{welcomeMessage}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {quickActions.map((action) => (
                                        <button
                                            key={action}
                                            onClick={() => handleSend(action)}
                                            disabled={isLoading}
                                            className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                        >
                                            <Sparkles className="h-3 w-3 text-primary" />
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Messages */}
                        {messages.map((msg) => (
                            <ChatMessage
                                key={msg.id}
                                message={msg}
                                onNavigate={onNavigate}
                                renderProduct={renderProduct}
                                renderCollection={renderCollection}
                                renderCartSummary={renderCartSummary}
                                renderOrder={renderOrder}
                                renderPromotion={renderPromotion}
                                formatPrice={formatPrice}
                                addingToCart={addingToCart}
                                onAddToCartClick={handleAddToCartClick}
                            />
                        ))}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">
                                        {status === 'streaming' ? 'Responding...' : 'Thinking...'}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div ref={scrollRef} />
                    </div>
                </div>

                {/* Input */}
                <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t p-4">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={placeholder}
                        disabled={isLoading}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !inputValue.trim()}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        aria-label="Send message"
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </button>
                </form>
            </>
        );
    }
}

/** Default price formatter: smallest currency unit → localized currency string (e.g. "NPR 99.00"). */
export function formatChatPrice(price: number, currencyCode?: string): string {
    const amount = price / 100;
    if (!currencyCode) {
        return amount.toFixed(2);
    }
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currencyCode}`;
    }
}
