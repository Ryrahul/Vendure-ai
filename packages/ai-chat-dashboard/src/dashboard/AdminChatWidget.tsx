import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── Types (mirror backend response) ────────────────────────────────

interface Product { id: string; name: string; slug: string; price: number; image: string | null; variantId: string; }
interface Collection { id: string; name: string; slug: string; }
interface OrderLine { productName: string; quantity: number; image: string | null; linePriceWithTax: number; }
interface Order {
    id: string; code: string; state: string; total: number; orderPlacedAt: string | null;
    lines: OrderLine[];
    fulfillments: Array<{ state: string; method: string; trackingCode: string | null }>;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    products?: Product[];
    collections?: Collection[];
    orders?: Order[];
}

// ─── Component ──────────────────────────────────────────────────────

export function AdminChatWidget() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    function getHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
        return messages.map(m => ({ role: m.role, content: m.content }));
    }

    async function sendMessage(text: string) {
        if (!text.trim() || isLoading) return;
        setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text.trim() }]);
        setInput('');
        setIsLoading(true);
        try {
            const sessionToken = localStorage.getItem('vendure-session-token');
            const channelToken = localStorage.getItem('vendure-selected-channel-token');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
            if (channelToken) headers['vendure-token'] = channelToken;

            const res = await fetch('/admin-ai-chat/chat', {
                method: 'POST', headers, credentials: 'include',
                body: JSON.stringify({ message: text.trim(), history: getHistory() }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, {
                id: `a-${Date.now()}`, role: 'assistant', content: data.message ?? 'No response',
                products: data.products, collections: data.collections, orders: data.orders,
            }]);
        } catch (err) {
            setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Request failed'}` }]);
        } finally { setIsLoading(false); }
    }

    return (
        <div className="ac-root">
            <div className="ac-messages">
                {messages.length === 0 && (
                    <div className="ac-empty">
                        <div className="ac-empty-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 6V2H8"/><path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z"/>
                                <path d="M2 12h2"/><path d="M9 11v2"/><path d="M15 11v2"/><path d="M20 12h2"/>
                            </svg>
                        </div>
                        <div className="ac-empty-title">Admin AI Assistant</div>
                        <div className="ac-empty-sub">Ask about products, orders, customers, or collections</div>
                        <div className="ac-chips">
                            {['Show recent orders', 'Search for laptops', 'List collections', 'Find customers named john'].map(a => (
                                <button key={a} className="ac-chip" onClick={() => sendMessage(a)}>{a}</button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`ac-row ac-row--${msg.role}`}>
                        {msg.role === 'assistant' && <div className="ac-avatar">AI</div>}
                        <div className="ac-msg-col">
                            <div className={`ac-bubble ac-bubble--${msg.role}`}>
                                {msg.role === 'assistant'
                                    ? <div className="ac-md"><Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown></div>
                                    : msg.content}
                            </div>
                            {/* Product cards */}
                            {msg.products && msg.products.length > 0 && (
                                <div className="ac-cards">
                                    {msg.products.map(p => <ProductCard key={p.id} product={p} />)}
                                </div>
                            )}
                            {/* Order cards */}
                            {msg.orders && msg.orders.length > 0 && (
                                <div className="ac-order-cards">
                                    {msg.orders.map(o => <OrderCard key={o.id} order={o} />)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="ac-row ac-row--assistant">
                        <div className="ac-avatar">AI</div>
                        <div className="ac-bubble ac-bubble--assistant"><span className="ac-dots"><span/><span/><span/></span></div>
                    </div>
                )}
                <div ref={scrollRef} />
            </div>

            <form className="ac-bar" onSubmit={e => { e.preventDefault(); sendMessage(input); }}>
                <input className="ac-input" value={input} onChange={e => setInput(e.target.value)}
                    placeholder="Ask about products, orders, customers..." disabled={isLoading} />
                <button type="submit" className="ac-send" disabled={isLoading || !input.trim()}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                    </svg>
                </button>
            </form>
            <style>{STYLES}</style>
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
    const price = `$${(product.price / 100).toFixed(2)}`;
    return (
        <div className="ac-pcard" onClick={() => window.open(`/dashboard/products/${product.id}`, '_blank')}>
            <div className="ac-pcard-img">
                {product.image
                    ? <img src={product.image} alt={product.name} />
                    : <div className="ac-pcard-noimg">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                      </div>}
            </div>
            <div className="ac-pcard-body">
                <div className="ac-pcard-name">{product.name}</div>
                <div className="ac-pcard-price">{price}</div>
            </div>
        </div>
    );
}

function OrderCard({ order }: { order: Order }) {
    const total = `$${(order.total / 100).toFixed(2)}`;
    const date = order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString() : 'N/A';
    const stateColor = order.state === 'PaymentSettled' ? '#22c55e' : order.state === 'Cancelled' ? '#ef4444' : '#6366f1';
    return (
        <div className="ac-ocard" onClick={() => window.open(`/dashboard/orders/${order.id}`, '_blank')}>
            <div className="ac-ocard-header">
                <span className="ac-ocard-code">{order.code}</span>
                <span className="ac-ocard-state" style={{ background: stateColor }}>{order.state}</span>
            </div>
            <div className="ac-ocard-meta">{date} &middot; {total} &middot; {order.lines.length} item(s)</div>
            {order.lines.length > 0 && (
                <div className="ac-ocard-lines">
                    {order.lines.slice(0, 3).map((l, i) => (
                        <div key={i} className="ac-ocard-line">
                            {l.image && <img src={l.image} alt={l.productName} className="ac-ocard-line-img" />}
                            <span className="ac-ocard-line-name">{l.quantity}x {l.productName}</span>
                        </div>
                    ))}
                    {order.lines.length > 3 && <div className="ac-ocard-more">+{order.lines.length - 3} more</div>}
                </div>
            )}
        </div>
    );
}

// ─── Styles ─────────────────────────────────────────────────────────

const STYLES = `
.ac-root { display:flex; flex-direction:column; height:100%; min-height:0; font-family:var(--font-sans,system-ui,-apple-system,sans-serif); }
.ac-messages { flex:1; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:16px; }

/* Empty */
.ac-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:12px; }
.ac-empty-icon { color:var(--color-muted-foreground,#94a3b8); }
.ac-empty-title { font-size:18px; font-weight:600; color:var(--color-foreground,#0f172a); }
.ac-empty-sub { font-size:14px; color:var(--color-muted-foreground,#64748b); }
.ac-chips { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:8px; }
.ac-chip {
    padding:7px 14px; border-radius:99px; font-size:13px; cursor:pointer;
    border:1px solid var(--color-border,#e2e8f0); background:var(--color-background,#fff);
    color:var(--color-foreground,#334155); transition:all .15s;
}
.ac-chip:hover { border-color:var(--color-primary,#6366f1); color:var(--color-primary,#6366f1); background:color-mix(in srgb,var(--color-primary,#6366f1) 6%,transparent); }

/* Rows */
.ac-row { display:flex; gap:10px; align-items:flex-start; }
.ac-row--user { justify-content:flex-end; }
.ac-row--assistant { justify-content:flex-start; }
.ac-msg-col { display:flex; flex-direction:column; gap:10px; max-width:88%; min-width:0; }
.ac-avatar {
    width:28px; height:28px; border-radius:8px; flex-shrink:0; margin-top:2px;
    background:var(--color-primary,#6366f1); color:#fff;
    display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; letter-spacing:.5px;
}

/* Bubbles */
.ac-bubble { padding:10px 14px; border-radius:14px; font-size:14px; line-height:1.55; word-break:break-word; }
.ac-bubble--user { background:var(--color-primary,#6366f1); color:var(--color-primary-foreground,#fff); border-bottom-right-radius:4px; }
.ac-bubble--assistant { background:var(--color-card,#fff); color:var(--color-foreground,#0f172a); border:1px solid var(--color-border,#e2e8f0); border-bottom-left-radius:4px; padding:12px 16px; }

/* Markdown */
.ac-md { font-size:14px; line-height:1.6; }
.ac-md > *:first-child { margin-top:0 !important; }
.ac-md > *:last-child { margin-bottom:0 !important; }
.ac-md p { margin:0 0 8px; }
.ac-md p:last-child { margin:0; }
.ac-md strong { font-weight:600; }
.ac-md ul,.ac-md ol { margin:4px 0 8px; padding-left:20px; }
.ac-md li { margin:2px 0; }
.ac-md code { background:var(--color-muted,#f1f5f9); padding:1px 5px; border-radius:4px; font-size:12.5px; font-family:var(--font-mono,ui-monospace,monospace); }
.ac-md pre { background:var(--color-muted,#f1f5f9); padding:12px; border-radius:8px; overflow-x:auto; margin:8px 0; }
.ac-md pre code { background:none; padding:0; }
.ac-md table { border-collapse:collapse; width:100%; margin:10px 0; font-size:13px; border:1px solid var(--color-border,#e2e8f0); border-radius:8px; overflow:hidden; }
.ac-md thead { background:var(--color-muted,#f1f5f9); }
.ac-md th { text-align:left; padding:8px 12px; font-weight:600; font-size:12px; color:var(--color-muted-foreground,#64748b); text-transform:uppercase; letter-spacing:.3px; border-bottom:2px solid var(--color-border,#e2e8f0); }
.ac-md td { padding:8px 12px; border-bottom:1px solid var(--color-border,#f1f5f9); }
.ac-md tbody tr:last-child td { border-bottom:none; }
.ac-md tbody tr:hover { background:var(--color-muted,#f8fafc); }

/* Product cards row */
.ac-cards { display:flex; gap:10px; overflow-x:auto; padding:2px 0; }
.ac-pcard {
    flex-shrink:0; width:160px; border-radius:10px; overflow:hidden; cursor:pointer;
    border:1px solid var(--color-border,#e2e8f0); background:var(--color-card,#fff);
    transition:all .15s; box-shadow:0 1px 2px rgba(0,0,0,.04);
}
.ac-pcard:hover { border-color:var(--color-primary,#6366f1); box-shadow:0 2px 8px rgba(99,102,241,.12); transform:translateY(-1px); }
.ac-pcard-img { width:100%; height:120px; overflow:hidden; background:var(--color-muted,#f1f5f9); }
.ac-pcard-img img { width:100%; height:100%; object-fit:cover; }
.ac-pcard-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--color-muted-foreground,#94a3b8); }
.ac-pcard-body { padding:8px 10px; }
.ac-pcard-name { font-size:13px; font-weight:500; color:var(--color-foreground,#0f172a); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ac-pcard-price { font-size:13px; font-weight:600; color:var(--color-primary,#6366f1); margin-top:2px; }

/* Order cards */
.ac-order-cards { display:flex; flex-direction:column; gap:8px; }
.ac-ocard {
    border-radius:10px; padding:12px 14px; cursor:pointer;
    border:1px solid var(--color-border,#e2e8f0); background:var(--color-card,#fff);
    transition:all .15s; box-shadow:0 1px 2px rgba(0,0,0,.04);
}
.ac-ocard:hover { border-color:var(--color-primary,#6366f1); box-shadow:0 2px 8px rgba(99,102,241,.12); }
.ac-ocard-header { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
.ac-ocard-code { font-size:13px; font-weight:600; font-family:var(--font-mono,ui-monospace,monospace); color:var(--color-foreground,#0f172a); }
.ac-ocard-state { font-size:11px; font-weight:600; padding:2px 8px; border-radius:99px; color:#fff; text-transform:uppercase; letter-spacing:.3px; }
.ac-ocard-meta { font-size:12px; color:var(--color-muted-foreground,#64748b); margin-bottom:6px; }
.ac-ocard-lines { display:flex; flex-direction:column; gap:4px; }
.ac-ocard-line { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--color-foreground,#334155); }
.ac-ocard-line-img { width:28px; height:28px; border-radius:4px; object-fit:cover; }
.ac-ocard-line-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ac-ocard-more { font-size:11px; color:var(--color-muted-foreground,#94a3b8); padding-left:36px; }

/* Input */
.ac-bar { display:flex; gap:8px; padding:16px 24px; border-top:1px solid var(--color-border,#e2e8f0); background:var(--color-background,#fff); }
.ac-input {
    flex:1; padding:10px 14px; border-radius:10px; font-size:14px; outline:none;
    border:1px solid var(--color-border,#e2e8f0); background:var(--color-background,#fff);
    color:var(--color-foreground,#0f172a); transition:border-color .15s,box-shadow .15s;
}
.ac-input:focus { border-color:var(--color-primary,#6366f1); box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primary,#6366f1) 12%,transparent); }
.ac-input:disabled { opacity:.5; }
.ac-send {
    width:40px; height:40px; border-radius:10px; border:none; cursor:pointer;
    background:var(--color-primary,#6366f1); color:#fff;
    display:flex; align-items:center; justify-content:center; transition:opacity .15s;
}
.ac-send:hover:not(:disabled) { opacity:.85; }
.ac-send:disabled { opacity:.35; cursor:not-allowed; }

/* Dots */
.ac-dots { display:inline-flex; gap:4px; align-items:center; height:20px; }
.ac-dots span { width:6px; height:6px; border-radius:50%; background:var(--color-muted-foreground,#94a3b8); animation:ac-bounce .6s infinite alternate; }
.ac-dots span:nth-child(2) { animation-delay:.15s; }
.ac-dots span:nth-child(3) { animation-delay:.3s; }
@keyframes ac-bounce { to { opacity:.3; transform:translateY(-4px); } }
`;
