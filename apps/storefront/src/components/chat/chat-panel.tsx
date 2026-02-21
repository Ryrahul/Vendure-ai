'use client';

import * as React from 'react';
import {SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ScrollArea} from '@/components/ui/scroll-area';
import {formatPrice} from '@/lib/format';
import Link from 'next/link';
import Image from 'next/image';
import {SendIcon, Loader2Icon} from 'lucide-react';
import {cn} from '@/lib/utils';

export interface ChatProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
}

export interface ChatCollection {
    id: string;
    name: string;
    slug: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    products?: ChatProduct[];
    collections?: ChatCollection[];
}

interface ChatPanelProps {
    onClose?: () => void;
}

export function ChatPanel({onClose}: ChatPanelProps) {
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const [input, setInput] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        scrollRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        setMessages((prev) => [...prev, {role: 'user', content: text}]);
        setLoading(true);
        try {
            const res = await fetch('/api/ai-assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text }),
            });
            const data = await res.json();
            const products = data.products ?? [];
            const collections = data.collections ?? [];
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: data.message ?? '',
                    products: products.length ? products : undefined,
                    collections: collections.length ? collections : undefined,
                },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Something went wrong. Please try again.' },
            ]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <SheetContent
            side="right"
            className="flex h-full w-full flex-col sm:max-w-md p-0"
            onPointerDownOutside={onClose}
        >
            <SheetHeader className="shrink-0 p-4 border-b">
                <SheetTitle className="text-left">AI Assistant</SheetTitle>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1 p-4">
                <div className="space-y-4">
                    {messages.length === 0 && (
                        <p className="text-muted-foreground text-sm">
                            Ask for product suggestions, e.g. &quot;laptops&quot;, &quot;gift for dad&quot;, &quot;something under 50 dollars&quot;.
                        </p>
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
                                <p className="whitespace-pre-wrap">{msg.content}</p>
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
                                            <Link
                                                key={p.id}
                                                href={`/product/${p.slug}`}
                                                onClick={onClose}
                                                className="flex gap-2 rounded-md border bg-background p-2 text-left hover:bg-muted/50"
                                            >
                                                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted">
                                                    {p.image ? (
                                                        <Image
                                                            src={p.image}
                                                            alt={p.name}
                                                            fill
                                                            className="object-cover"
                                                            sizes="56px"
                                                        />
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs flex items-center justify-center h-full">No image</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium text-foreground text-sm line-clamp-2">{p.name}</p>
                                                    <p className="text-primary font-semibold text-sm">{formatPrice(p.price)}</p>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="rounded-lg bg-muted px-3 py-2">
                                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
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
                    placeholder="Ask for products..."
                    className="flex-1"
                    disabled={loading}
                />
                <Button type="submit" size="icon" disabled={loading}>
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
