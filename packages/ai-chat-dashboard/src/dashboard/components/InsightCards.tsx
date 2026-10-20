import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Globe, MapPin, Package, TrendingUp } from 'lucide-react';
import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { InsightCard, InventoryPlanItem } from '../types';

const C = {
    border: 'var(--border, #e2e8f0)',
    muted: 'var(--muted-foreground, #64748b)',
    fg: 'var(--foreground, #0f172a)',
    card: 'var(--background, #fff)',
    subtle: 'var(--muted, #f8fafc)',
    primary: 'var(--primary, #6366f1)',
    success: 'var(--success, #16a34a)',
    warning: 'var(--warning, #d97706)',
    danger: 'var(--destructive, #dc2626)',
};

function money(minor: number, currency: string, compact = false) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
        }).format(minor / 100);
    } catch {
        return `${(minor / 100).toFixed(2)} ${currency}`;
    }
}

function pct(now: number, before: number) {
    if (!before) return null;
    return ((now - before) / before) * 100;
}

function Shell({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: C.primary, display: 'inline-flex' }}>{icon}</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.fg }}>{title}</div>
                {subtitle && <div style={{ fontSize: 12, color: C.muted, marginLeft: 'auto' }}>{subtitle}</div>}
            </div>
            {children}
        </div>
    );
}

function Kpi({ label, value, change, hint }: { label: string; value: string; change?: number | null; hint?: string }) {
    const up = (change ?? 0) >= 0;
    return (
        <div style={{ flex: '1 1 120px', minWidth: 120, padding: '8px 10px', borderRadius: 8, background: C.subtle }}>
            <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.fg, marginTop: 2 }}>{value}</div>
            {change != null && (
                <div style={{ fontSize: 11, color: up ? C.success : C.danger, display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                    {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(change).toFixed(1)}%{hint ? <span style={{ color: C.muted, marginLeft: 4 }}>{hint}</span> : null}
                </div>
            )}
        </div>
    );
}

const tooltipStyle = { fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.fg };

function ForecastCard({ card }: { card: Extract<InsightCard, { type: 'forecast' }> }) {
    const cur = card.currencyCode;
    const data = [
        ...card.history.map(h => ({ date: h.date, actual: h.revenue })),
        ...card.forecast.map(f => ({ date: f.date, forecast: f.revenue, range: [f.lower, f.upper] as [number, number] })),
    ];
    // Join the lines: the forecast starts at the last actual point.
    const lastActual = card.history[card.history.length - 1];
    if (lastActual) {
        const idx = card.history.length - 1;
        (data[idx] as any).forecast = lastActual.revenue;
    }
    const change = pct(card.totals.forecastRevenue, card.totals.previousPeriodRevenue);
    return (
        <Shell icon={<TrendingUp size={16} />} title={`Next ${card.horizonDays} days forecast`} subtitle={card.method.replace(/-/g, ' ')}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <Kpi label="Expected revenue" value={money(card.totals.forecastRevenue, cur)} change={change} hint={`vs last ${card.horizonDays}d`} />
                <Kpi label="Likely range" value={`${money(card.totals.lower, cur, true)} – ${money(card.totals.upper, cur, true)}`} />
                <Kpi label="Expected orders" value={String(card.totals.forecastOrders)} />
                <Kpi
                    label={`Past accuracy (${card.backtest.days}-day totals)`}
                    value={card.backtest.totalError != null ? `±${Math.round(card.backtest.totalError * 100)}%` : 'n/a'}
                />
            </div>
            <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                    <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.muted }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                        <YAxis tick={{ fontSize: 10, fill: C.muted }} tickFormatter={(v: number) => money(v, cur, true)} width={64} />
                        <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(value: any, name: string) =>
                                Array.isArray(value) ? [`${money(value[0], cur)} – ${money(value[1], cur)}`, 'Likely range'] : [money(Number(value), cur), name === 'actual' ? 'Actual' : 'Forecast']
                            }
                        />
                        <Area dataKey="range" stroke="none" fill={C.primary} fillOpacity={0.12} isAnimationActive={false} />
                        <Line dataKey="actual" stroke={C.fg} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Line dataKey="forecast" stroke={C.primary} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                Projection of past daily sales. It cannot know about upcoming promotions, holidays or stock-outs.
            </div>
        </Shell>
    );
}

function TrendCard({ card }: { card: Extract<InsightCard, { type: 'salesTrend' }> }) {
    return (
        <Shell icon={<TrendingUp size={16} />} title={`Sales by ${card.granularity}`}>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                    <BarChart data={card.points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickFormatter={(l: string) => (card.granularity === 'month' ? l : l.slice(5))} minTickGap={16} />
                        <YAxis tick={{ fontSize: 10, fill: C.muted }} tickFormatter={(v: number) => money(v, card.currencyCode, true)} width={64} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [money(Number(v), card.currencyCode), 'Revenue']} />
                        <Bar dataKey="revenue" fill={C.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Shell>
    );
}

function SummaryCard({ card }: { card: Extract<InsightCard, { type: 'salesSummary' }> }) {
    const cur = card.currencyCode;
    return (
        <Shell icon={<TrendingUp size={16} />} title={`Last ${card.days} days`} subtitle={`vs previous ${card.days} days`}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Kpi label="Revenue" value={money(card.revenue, cur)} change={pct(card.revenue, card.previous.revenue)} />
                <Kpi label="Orders" value={String(card.orders)} change={pct(card.orders, card.previous.orders)} />
                <Kpi label="Avg order" value={money(card.averageOrderValue, cur)} change={pct(card.averageOrderValue, card.previous.averageOrderValue)} />
                <Kpi label="Units sold" value={String(card.unitsSold)} change={pct(card.unitsSold, card.previous.unitsSold)} />
            </div>
        </Shell>
    );
}

const STATUS: Record<InventoryPlanItem['status'], { label: string; color: string }> = {
    'reorder-now': { label: 'Reorder now', color: C.danger },
    'reorder-soon': { label: 'Reorder soon', color: C.warning },
    ok: { label: 'OK', color: C.success },
    overstock: { label: 'Overstock', color: C.primary },
    'not-tracked': { label: 'Not tracked', color: C.muted },
};

function InventoryCard({ card }: { card: Extract<InsightCard, { type: 'inventoryPlan' }> }) {
    const [showAll, setShowAll] = useState(false);
    const rows = showAll ? card.items : card.items.slice(0, 8);
    const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontWeight: 600, fontSize: 11, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, color: C.fg, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    return (
        <Shell icon={<Package size={16} />} title={`Inventory plan — next ${card.horizonDays} days`} subtitle={`${card.leadTimeDays}-day supplier lead time`}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={th}>Product</th>
                            <th style={th}>Status</th>
                            <th style={{ ...th, textAlign: 'right' }}>In stock</th>
                            <th style={{ ...th, textAlign: 'right' }}>Sells / day</th>
                            <th style={{ ...th, textAlign: 'right' }}>Days left</th>
                            <th style={th}>Runs out</th>
                            <th style={{ ...th, textAlign: 'right' }}>Order qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(item => (
                            <tr key={item.variantId}>
                                <td style={{ ...td, whiteSpace: 'normal' }}>
                                    {item.name}
                                    <div style={{ fontSize: 11, color: C.muted }}>{item.sku}</div>
                                </td>
                                <td style={td}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS[item.status].color }}>● {STATUS[item.status].label}</span>
                                </td>
                                <td style={{ ...td, textAlign: 'right' }}>{item.available ?? '—'}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{item.dailyDemand}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{item.daysOfCover ?? '—'}</td>
                                <td style={td}>{item.stockoutDate ?? '—'}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: item.suggestedOrderQty ? 600 : 400 }}>{item.suggestedOrderQty || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {card.items.length > 8 && (
                <button
                    type="button"
                    onClick={() => setShowAll(v => !v)}
                    style={{ marginTop: 8, fontSize: 12, color: C.primary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                    {showAll ? 'Show fewer' : `Show all ${card.items.length}`}
                </button>
            )}
        </Shell>
    );
}

function BarList({ rows, format }: { rows: Array<{ label: string; value: number; extra?: string }>; format: (v: number) => string }) {
    const max = Math.max(1, ...rows.map(r => r.value));
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => (
                <div key={r.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.fg, gap: 8 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                        <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>
                            {format(r.value)}
                            {r.extra ? ` · ${r.extra}` : ''}
                        </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: C.subtle, marginTop: 3 }}>
                        <div style={{ height: 6, borderRadius: 3, width: `${(r.value / max) * 100}%`, background: C.primary }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function TopProductsCard({ card }: { card: Extract<InsightCard, { type: 'topProducts' }> }) {
    return (
        <Shell icon={<Package size={16} />} title={`Top products — last ${card.days} days`} subtitle={`by ${card.sortBy}`}>
            <BarList
                rows={card.items.map(p => ({
                    label: p.name,
                    value: card.sortBy === 'units' ? p.unitsSold : p.revenue,
                    extra: card.sortBy === 'units' ? money(p.revenue, card.currencyCode) : `${p.unitsSold} sold`,
                }))}
                format={v => (card.sortBy === 'units' ? `${v} units` : money(v, card.currencyCode))}
            />
        </Shell>
    );
}

function LocationsCard({ card }: { card: Extract<InsightCard, { type: 'customerLocations' }> }) {
    const [tab, setTab] = useState<'cities' | 'regions' | 'countries'>('cities');
    const rows = card[tab];
    return (
        <Shell icon={<MapPin size={16} />} title={`Where customers are — last ${card.days} days`} subtitle={`${card.ordersWithAddress} orders`}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {(['cities', 'regions', 'countries'] as const).map(t => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        style={{
                            fontSize: 12,
                            padding: '3px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            border: `1px solid ${t === tab ? C.primary : C.border}`,
                            background: t === tab ? C.subtle : 'transparent',
                            color: t === tab ? C.fg : C.muted,
                        }}
                    >
                        {t[0].toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>
            <BarList rows={rows.map(r => ({ label: r.location, value: r.orders, extra: money(r.revenue, card.currencyCode) }))} format={v => `${v} orders`} />
        </Shell>
    );
}

function SourcesCard({ card }: { card: Extract<InsightCard, { type: 'webSources' }> }) {
    return (
        <Shell icon={<Globe size={16} />} title="Web sources">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {card.sources.map(s => {
                    let host = s.url;
                    try {
                        host = new URL(s.url).hostname.replace(/^www\./, '');
                    } catch {
                        /* keep url */
                    }
                    return (
                        <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 12, color: C.fg, textDecoration: 'none' }}
                        >
                            <ExternalLink size={12} style={{ color: C.muted, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                            <span style={{ color: C.muted, flexShrink: 0 }}>{host}</span>
                        </a>
                    );
                })}
            </div>
        </Shell>
    );
}

/** Cards with nothing to show (older plugin versions sent these for channels without sales). */
function isEmpty(card: InsightCard): boolean {
    switch (card.type) {
        case 'salesSummary':
            return !card.orders && !card.previous?.orders;
        case 'salesTrend':
            return !card.points?.some(p => p.orders > 0);
        case 'forecast':
            return !card.forecast?.length;
        case 'inventoryPlan':
        case 'topProducts':
            return !card.items?.length;
        case 'customerLocations':
            return !card.ordersWithAddress;
        case 'webSources':
            return !card.sources?.length;
        default:
            return true;
    }
}

export function hasVisibleInsights(insights: InsightCard[]): boolean {
    return insights.some(card => !isEmpty(card));
}

/** Charts, tables and source lists the assistant attached to a reply. */
export function InsightCards({ insights }: { insights: InsightCard[] }) {
    const cards = insights.filter(card => !isEmpty(card));
    if (!cards.length) return null;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cards.map((card, i) => {
                switch (card.type) {
                    case 'forecast':
                        return <ForecastCard key={i} card={card} />;
                    case 'salesTrend':
                        return <TrendCard key={i} card={card} />;
                    case 'salesSummary':
                        return <SummaryCard key={i} card={card} />;
                    case 'inventoryPlan':
                        return <InventoryCard key={i} card={card} />;
                    case 'topProducts':
                        return <TopProductsCard key={i} card={card} />;
                    case 'customerLocations':
                        return <LocationsCard key={i} card={card} />;
                    case 'webSources':
                        return <SourcesCard key={i} card={card} />;
                    default:
                        return null;
                }
            })}
        </div>
    );
}
