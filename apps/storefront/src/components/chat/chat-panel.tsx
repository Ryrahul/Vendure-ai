'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import {SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ScrollArea} from '@/components/ui/scroll-area';
import {formatPrice} from '@/lib/format';
import Link from 'next/link';
import Image from 'next/image';
import {SendIcon, Loader2Icon, StoreIcon, SparklesIcon, ShoppingCartIcon, CheckIcon, PlusIcon, MinusIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {toast} from 'sonner';

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

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    products?: ChatProduct[];
    collections?: ChatCollection[];
    addToCartAction?: AddToCartAction;
}

interface ChatPanelProps {
    onClose?: () => void;
}

const QUICK_ACTIONS = [
    'What do you sell?',
    'Show me your collections',
    'Help me find a gift',
    'What\'s popular?',
];

export function ChatPanel({onClose}: ChatPanelProps) {
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const [input, setInput] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [addingToCart, setAddingToCart] = React.useState<string | null>(null); // variantId being added
    const scrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        scrollRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    async function handleAddToCart(variantId: string, productName: string, quantity: number = 1) {
        if (addingToCart) return;
        console.log(`[chat] handleAddToCart: variantId=${variantId}, productName=${productName}, quantity=${quantity}`);
        setAddingToCart(variantId);
        try {
            const {addToCart} = await import('@/app/product/[slug]/actions');
            const result = await addToCart(variantId, quantity);
            if (result.success) {
                toast.success('Added to cart', {
                    description: `${productName} has been added to your cart`,
                });
                setMessages(prev => [
                    ...prev,
                    {role: 'assistant', content: `Added **${productName}** (x${quantity}) to your cart!`},
                ]);
            } else {
                toast.error('Error', {
                    description: result.error || 'Failed to add item to cart',
                });
                setMessages(prev => [
                    ...prev,
                    {role: 'assistant', content: `Sorry, I couldn't add that to cart: ${result.error || 'Unknown error'}`},
                ]);
            }
        } catch {
            toast.error('Failed to add to cart');
        } finally {
            setAddingToCart(null);
        }
    }

    async function sendMessage(text: string) {
        if (!text.trim() || loading) return;
        const trimmed = text.trim();
        setInput('');

        const userMsg: ChatMessage = {role: 'user', content: trimmed};
        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);

        try {
            // Build history with product data so LLM knows variantIds from previous turns
            const history = messages.map((msg) => {
                let content = msg.content;
                if (msg.role === 'assistant' && msg.products && msg.products.length > 0) {
                    const productList = msg.products
                        .map(p => `"${p.name}" (variantId: ${p.variantId}, price: ${p.price})`)
                        .join(', ');
                    content += `\n[Products shown: ${productList}]`;
                }
                return { role: msg.role, content };
            });

            const res = await fetch('/api/ai-assistant/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: trimmed, history}),
            });
            const data = await res.json();
            const products: ChatProduct[] = data.products ?? [];
            const collections: ChatCollection[] = data.collections ?? [];
            const addToCartAction: AddToCartAction | null = data.addToCartAction ?? null;

            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: data.message ?? '',
                    products: products.length ? products : undefined,
                    collections: collections.length ? collections : undefined,
                    addToCartAction: addToCartAction ?? undefined,
                },
            ]);

            // If there's an addToCartAction, auto-execute it (LLM already confirmed with user)
            if (addToCartAction) {
                console.log('[chat] addToCartAction from backend:', JSON.stringify(addToCartAction));
                await handleAddToCart(
                    addToCartAction.variantId,
                    addToCartAction.productName ?? 'Item',
                    addToCartAction.quantity,
                );
            }
        } catch {
            setMessages((prev) => [
                ...prev,
                {role: 'assistant', content: 'Something went wrong. Please try again.'},
            ]);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        await sendMessage(input);
    }

    return (
        <SheetContent
            side="right"
            className="flex h-full w-full flex-col sm:max-w-md p-0"
            onPointerDownOutside={onClose}
        >
            <SheetHeader className="shrink-0 p-4 border-b">
                <SheetTitle className="text-left flex items-center gap-2">
                    <StoreIcon className="h-5 w-5 text-primary" />
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
                                        Hi there! I&apos;m your shopping assistant. I can help you find products, browse collections, check prices, and even add items to your cart. What are you looking for today?
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_ACTIONS.map((action) => (
                                    <button
                                        key={action}
                                        onClick={() => sendMessage(action)}
                                        disabled={loading}
                                        className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                                    >
                                        <SparklesIcon className="h-3 w-3 text-primary" />
                                        {action}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div
                            key={i}
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
                                {msg.role === 'assistant' ? (
                                    <div className="chat-markdown max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_img]:hidden [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                )}
                                {msg.role === 'assistant' && msg.collections && msg.collections.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {msg.collections.map((c) => (
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
                                {msg.role === 'assistant' && msg.products && msg.products.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {msg.products.map((p) => (
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
                                                        <span className="text-muted-foreground text-xs flex items-center justify-center h-full">No img</span>
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
                                                            <Loader2Icon className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <ShoppingCartIcon className="h-3 w-3" />
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
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="rounded-lg bg-muted px-3 py-2 flex items-center gap-2">
                                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>
            <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t p-4">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about products, collections, prices..."
                    className="flex-1"
                    disabled={loading}
                />
                <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                    {loading ? (
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                        <SendIcon className="h-4 w-4" />
                    )}
                    <span className="sr-only">Send</span>
                </Button>
            </form>
        </SheetContent>
    );
}
