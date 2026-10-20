import { describe, expect, it } from 'vitest';

import { backtest, demandRate, demandStdDev, forecastSeries } from './forecast';

/** Deterministic pseudo-random noise in [-1, 1]. */
function noise(i: number) {
    const x = Math.sin(i * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
}

/** Weekly pattern (weekends busier) on a rising trend, with noise. */
function syntheticSales(days: number, start = 1000, growthPerDay = 5, noiseLevel = 50) {
    const weekly = [0.8, 0.85, 0.9, 1.0, 1.1, 1.35, 1.3];
    return Array.from({ length: days }, (_, t) => (start + growthPerDay * t) * weekly[t % 7] + noise(t) * noiseLevel);
}

describe('forecastSeries', () => {
    it('uses Holt-Winters with enough history and recovers the weekly pattern', () => {
        const history = syntheticSales(120);
        const truth = syntheticSales(150).slice(120);
        const result = forecastSeries(history, 30);
        expect(result.method).toBe('holt-winters-weekly');
        expect(result.values).toHaveLength(30);
        const wape = truth.reduce((s, v, i) => s + Math.abs(v - result.values[i]), 0) / truth.reduce((s, v) => s + v, 0);
        expect(wape).toBeLessThan(0.1);
        // Busiest forecast day lines up with the weekend peak (index 5 in the pattern).
        const firstWeek = result.values.slice(0, 7);
        const peakDay = (120 + firstWeek.indexOf(Math.max(...firstWeek))) % 7;
        expect([5, 6]).toContain(peakDay);
    });

    it('intervals contain the forecast and widen with the horizon', () => {
        const result = forecastSeries(syntheticSales(90), 30);
        result.values.forEach((v, i) => {
            expect(result.lower[i]).toBeLessThanOrEqual(v);
            expect(result.upper[i]).toBeGreaterThanOrEqual(v);
        });
        expect(result.upper[29] - result.lower[29]).toBeGreaterThan(result.upper[0] - result.lower[0]);
    });

    it('falls back to simpler methods with little history', () => {
        expect(forecastSeries([5, 6, 7, 8, 9, 10, 11, 12], 5).method).toBe('holt-linear');
        expect(forecastSeries([3, 5], 5)).toMatchObject({ method: 'mean', values: [4, 4, 4, 4, 4] });
        expect(forecastSeries([], 3).values).toEqual([0, 0, 0]);
    });

    it('never forecasts negative sales', () => {
        const declining = Array.from({ length: 60 }, (_, t) => Math.max(0, 100 - t * 3));
        expect(Math.min(...forecastSeries(declining, 30).values)).toBeGreaterThanOrEqual(0);
    });
});

describe('period totals', () => {
    /** A small shop: a few orders a day at very different prices, so single days are noisy. */
    function noisyShop(days: number, seed: number) {
        let x = seed;
        const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
        const weekly = [1, 1, 1, 1, 1.4, 1.6, 1];
        return Array.from({ length: days }, (_, t) => {
            let revenue = 0;
            const orders = Math.round(rnd() * 8 * weekly[t % 7]);
            for (let o = 0; o < orders; o++) revenue += rnd() < 0.15 ? 120000 : 9000 + rnd() * 20000;
            return revenue;
        });
    }

    it('gives a period range far narrower than adding up daily bounds', () => {
        const result = forecastSeries(noisyShop(90, 7), 30);
        const sumOfDaily = result.upper.reduce((a, b) => a + b, 0) - result.lower.reduce((a, b) => a + b, 0);
        expect(result.total.value).toBeCloseTo(result.values.reduce((a, b) => a + b, 0));
        expect(result.total.upper - result.total.lower).toBeLessThan(sumOfDaily / 2);
    });

    it('the ~80% period range covers roughly 80% of real outcomes', () => {
        let covered = 0;
        const runs = 60;
        for (let seed = 1; seed <= runs; seed++) {
            const series = noisyShop(120, seed * 7919);
            const { total } = forecastSeries(series.slice(0, 90), 30);
            const actual = series.slice(90).reduce((a, b) => a + b, 0);
            if (actual >= total.lower && actual <= total.upper) covered++;
        }
        expect(covered / runs).toBeGreaterThan(0.6);
        expect(covered / runs).toBeLessThan(0.98);
    });
});

describe('backtest', () => {
    it('reports the error on held-out days and on the period total', () => {
        const result = backtest(syntheticSales(120), 14);
        expect(result.days).toBe(14);
        expect(result.windows).toBe(3);
        expect(result.wape).not.toBeNull();
        expect(result.wape!).toBeLessThan(0.1);
        expect(result.totalError!).toBeLessThan(0.05);
    });

    it('declines to backtest tiny histories', () => {
        expect(backtest([1, 2, 3], 14)).toMatchObject({ days: 0, wape: null });
    });
});

describe('demand', () => {
    it('weights recent demand more', () => {
        const units = [...Array(28).fill(1), ...Array(28).fill(3)];
        expect(demandRate(units)).toBeCloseTo(0.6 * 3 + 0.4 * 1);
        expect(demandStdDev(Array(56).fill(2))).toBe(0);
    });
});
