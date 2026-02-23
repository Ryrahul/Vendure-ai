'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import {useChat} from '@ai-sdk/react';
import {DefaultChatTransport, type UIMessage} from 'ai';
import {SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ScrollArea} from '@/components/ui/scroll-area';
import {formatPrice} from '@/lib/format';
import Link from 'next/link';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {SendIcon, Loader2Icon, StoreIcon, SparklesIcon, ShoppingCartIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {toast} from 'sonner';

// ──────────────────────────────────────────────
// Types for structured data extracted from tool results
// ──────────────────────────────────────────────
export interface ChatProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
    variantId: string;
}

export interface ChatCollection {
    id: string;
    name: string;
    slug: string;
}

interface AddToCartAction {
    variantId: string;
    quantity: number;
    productName?: string;
}

export interface ChatCartLine {
    orderLineId: string;
    productName: string;
    variantId: string;
    quantity: number;
    linePriceWithTax: number;
}

export interface ChatActiveOrder {
    id: string;
    code: string;
    totalQuantity: number;
    totalWithTax: number;
    lines: ChatCartLine[];
}

interface ChatPanelProps {
    onClose?: () => void;
}

const QUICK_ACTIONS = [
    'What do you sell?',
    'Show me your collections',
    'Help me find a gift',
    "What's popular?",
];

// ──────────────────────────────────────────────
// Helper: extract structured data from tool invocation parts
// ──────────────────────────────────────────────
interface ExtractedData {
    products: ChatProduct[];
    collections: ChatCollection[];
    addToCartAction?: AddToCartAction;
    activeOrder?: ChatActiveOrder;
}

function extractToolOutput(p: Record<string, unknown>, data: ExtractedData) {
    const result = p.output as Record<string, unknown>;

    // Extract products (image URLs are already fully resolved by the backend)
    if (Array.isArray(result.products)) {
        for (const prod of result.products) {
            const product = prod as ChatProduct;
            if (!data.products.find(existing => existing.id === product.id)) {
                data.products.push(product);
            }
        }
    }

    // Extract collections
    if (Array.isArray(result.collections)) {
        for (const c of result.collections) {
            const collection = c as ChatCollection;
            if (!data.collections.find(existing => existing.id === collection.id)) {
                data.collections.push(collection);
            }
        }
    }

    // Extract action signals
    if (result.addToCartAction) {
        data.addToCartAction = result.addToCartAction as AddToCartAction;
    }
    if (result.activeOrder) {
        data.activeOrder = result.activeOrder as ChatActiveOrder;
    }
}

function extractDataFromMessage(message: UIMessage): ExtractedData {
    const data: ExtractedData = {products: [], collections: []};

    if (!message.parts) return data;

    for (const part of message.parts) {
        const p = part as Record<string, unknown>;

        // Static tool parts: type is "tool-<toolName>"
        if (typeof p.type === 'string' && p.type.startsWith('tool-') && p.state === 'output-available' && p.output) {
            extractToolOutput(p, data);
        }

        // Dynamic tool parts
        if (p.type === 'dynamic-tool' && p.state === 'output-available' && p.output) {
            extractToolOutput(p, data);
        }
    }

    return data;
}

// Get the text content from message parts
function getMessageText(message: UIMessage): string {
    if (!message.parts) return '';
    return message.parts
        .filter((p): p is { type: 'text'; text: string } => (p as Record<string, unknown>).type === 'text')
        .map(p => p.text)
        .join('');
}

// Create the chat transport once at module level
const chatTransport = new DefaultChatTransport({
    api: '/api/ai-assistant/chat',
});

export function ChatPanel({onClose}: ChatPanelProps) {
    const router = useRouter();
    const [addingToCart, setAddingToCart] = React.useState<string | null>(null);
    const [inputValue, setInputValue] = React.useState('');
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const processedActionsRef = React.useRef<Set<string>>(new Set());

    const {messages, sendMessage, status} = useChat({
        id: 'ai-shopping-assistant',
        transport: chatTransport,
    });

    const isLoading = status === 'submitted' || status === 'streaming';

    // Auto-scroll on new messages or status changes
    React.useEffect(() => {
        scrollRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages, status]);

    // Process add-to-cart actions and router refresh for cart changes.
    // Only runs when status becomes 'ready' (stream finished) to avoid firing mid-stream.
    React.useEffect(() => {
        if (status !== 'ready') return;

        const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
        if (!lastAssistantMsg) return;

        const data = extractDataFromMessage(lastAssistantMsg);

        // Auto-execute addToCartAction if present (only once per message ID)
        if (data.addToCartAction && !processedActionsRef.current.has(lastAssistantMsg.id + '-cart')) {
            processedActionsRef.current.add(lastAssistantMsg.id + '-cart');
            handleAddToCart(
                data.addToCartAction.variantId,
                data.addToCartAction.productName ?? 'Item',
                data.addToCartAction.quantity,
            );
        }

        // Refresh router when cart state changes
        if (data.activeOrder && !processedActionsRef.current.has(lastAssistantMsg.id + '-refresh')) {
            processedActionsRef.current.add(lastAssistantMsg.id + '-refresh');
            router.refresh();
        }
    }, [messages, status]);

    async function handleAddToCart(variantId: string, productName: string, quantity: number = 1) {
        if (addingToCart) return;
        setAddingToCart(variantId);
        try {
            const {addToCart} = await import('@/app/product/[slug]/actions');
            const result = await addToCart(variantId, quantity);
            if (result.success) {
                toast.success('Added to cart', {
                    description: `${productName} has been added to your cart`,
                });
            } else {
                toast.error('Error', {
                    description: result.error || 'Failed to add item to cart',
                });
            }
        } catch {
            toast.error('Failed to add to cart');
        } finally {
            setAddingToCart(null);
        }
    }

    async function handleSend(text: string) {
        if (!text.trim() || isLoading) return;
        setInputValue('');
        await sendMessage({text: text.trim()});
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        await handleSend(inputValue);
    }

    return (
        <SheetContent
            side="right"
            className="flex h-full w-full flex-col sm:max-w-md p-0"
            onPointerDownOutside={onClose}
        >
            <SheetHeader className="shrink-0 p-4 border-b">
                <SheetTitle className="text-left flex items-center gap-2">
                    <StoreIcon className="h-5 w-5 text-primary"/>
                    Shopping Assistant
                </SheetTitle>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1 p-4">
                <div className="space-y-4">
                    {messages.length === 0 && (
                        <div className="space-y-4 py-4">
                            <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm">
                                    <p>
                                        Hi there! I&apos;m your shopping assistant. I can help you find products, browse
                                        collections, check prices, and even add items to your cart. What are you looking for
                                        today?
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_ACTIONS.map((action) => (
                                    <button
                                        key={action}
                                        onClick={() => handleSend(action)}
                                        disabled={isLoading}
                                        className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                                    >
                                        <SparklesIcon className="h-3 w-3 text-primary"/>
                                        {action}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {messages.map((msg) => {
                        const text = getMessageText(msg);
                        const data = msg.role === 'assistant' ? extractDataFromMessage(msg) : null;

                        // Skip empty assistant messages (tool-only steps with no text)
                        if (msg.role === 'assistant' && !text && !data?.products.length && !data?.collections.length && !data?.activeOrder) {
                            return null;
                        }

                        return (
                            <div
                                key={msg.id}
                                className={cn(
                                    'flex',
                                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                                )}
                            >
                                <div
                                    className={cn(
                                        'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                                        msg.role === 'user'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted'
                                    )}
                                >
                                    {msg.role === 'assistant' && text ? (
                                        <div
                                            className="chat-markdown max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_img]:hidden [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                                            <ReactMarkdown>{text}</ReactMarkdown>
                                        </div>
                                    ) : msg.role === 'user' ? (
                                        <p className="whitespace-pre-wrap">{text}</p>
                                    ) : null}

                                    {/* Collections */}
                                    {data && data.collections.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {data.collections.map((c) => (
                                                <Link
                                                    key={c.id}
                                                    href={`/collection/${c.slug}`}
                                                    onClick={onClose}
                                                    className="inline-flex items-center rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground hover:bg-background"
                                                >
                                                    {c.name}
                                                </Link>
                                            ))}
                                        </div>
                                    )}

                                    {/* Cart summary */}
                                    {data?.activeOrder && data.activeOrder.lines.length > 0 && (
                                        <div className="mt-3 rounded-md border bg-background p-3 space-y-2">
                                            <div
                                                className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <ShoppingCartIcon className="h-3 w-3"/>
                                                    Your Cart ({data.activeOrder.totalQuantity} item{data.activeOrder.totalQuantity !== 1 ? 's' : ''})
                                                </span>
                                                <span className="font-semibold text-foreground">
                                                    {formatPrice(data.activeOrder.totalWithTax)}
                                                </span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {data.activeOrder.lines.map((line) => (
                                                    <div key={line.orderLineId}
                                                         className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span
                                                                className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{line.quantity}x</span>
                                                            <span className="truncate">{line.productName}</span>
                                                        </div>
                                                        <span
                                                            className="shrink-0 text-xs text-muted-foreground ml-2">{formatPrice(line.linePriceWithTax)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Product cards */}
                                    {data && data.products.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {data.products.map((p) => (
                                                <div
                                                    key={p.id}
                                                    className="flex gap-2 rounded-md border bg-background p-2"
                                                >
                                                    <Link
                                                        href={`/product/${p.slug}`}
                                                        onClick={onClose}
                                                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted"
                                                    >
                                                        {p.image ? (
                                                            <Image
                                                                src={p.image}
                                                                alt={p.name}
                                                                fill
                                                                className="object-cover"
                                                                sizes="56px"
                                                            />
                                                        ) : (
                                                            <span
                                                                className="text-muted-foreground text-xs flex items-center justify-center h-full">No img</span>
                                                        )}
                                                    </Link>
                                                    <div className="min-w-0 flex-1">
                                                        <Link
                                                            href={`/product/${p.slug}`}
                                                            onClick={onClose}
                                                            className="block"
                                                        >
                                                            <p className="font-medium text-foreground text-sm line-clamp-1 hover:underline">{p.name}</p>
                                                        </Link>
                                                        <p className="text-primary font-semibold text-sm">{formatPrice(p.price)}</p>
                                                    </div>
                                                    {p.variantId && (
                                                        <button
                                                            onClick={() => handleAddToCart(p.variantId, p.name)}
                                                            disabled={addingToCart === p.variantId}
                                                            className="self-center shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                                                        >
                                                            {addingToCart === p.variantId ? (
                                                                <Loader2Icon className="h-3 w-3 animate-spin"/>
                                                            ) : (
                                                                <ShoppingCartIcon className="h-3 w-3"/>
                                                            )}
                                                            <span className="sr-only sm:not-sr-only">Add</span>
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Loading / streaming indicator */}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="rounded-lg bg-muted px-3 py-2 flex items-center gap-2">
                                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground"/>
                                <span className="text-xs text-muted-foreground">
                                    {status === 'streaming' ? 'Responding...' : 'Thinking...'}
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef}/>
                </div>
            </ScrollArea>
            <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t p-4">
                <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask about products, collections, prices..."
                    className="flex-1"
                    disabled={isLoading}
                />
                <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()}>
                    {isLoading ? (
                        <Loader2Icon className="h-4 w-4 animate-spin"/>
                    ) : (
                        <SendIcon className="h-4 w-4"/>
                    )}
                    <span className="sr-only">Send</span>
                </Button>
            </form>
        </SheetContent>
    );
}
