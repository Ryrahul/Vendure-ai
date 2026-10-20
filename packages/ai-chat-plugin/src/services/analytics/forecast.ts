/**
 * Small, dependency-free time-series forecasting for daily sales.
 *
 * - >= 28 days of history: Holt-Winters (additive trend + weekly seasonality)
 * - >= 7 days:             Holt (level + trend)
 * - otherwise:             mean of the available days
 *
 * Smoothing parameters are chosen by grid search on one-step-ahead error. Prediction
 * intervals come from the in-sample residuals and widen with the horizon. Values are
 * clamped at zero (sales cannot be negative).
 */

export type ForecastMethod = 'holt-winters-weekly' | 'holt-linear' | 'mean';

export interface ForecastResult {
    method: ForecastMethod;
    /** Point forecast for each future day. */
    values: number[];
    /** ~80% prediction interval per day. */
    lower: number[];
    upper: number[];
    /**
     * Sum over the horizon with an ~80% interval for that sum. Daily errors partly cancel
     * out, so this is much narrower than adding up the daily bounds.
     */
    total: { value: number; lower: number; upper: number };
}

export interface BacktestResult {
    /** Days held out. */
    days: number;
    /** Weighted absolute percentage error of the daily figures (0.12 = 12%). */
    wape: number | null;
    /** Error of the period total (|forecast - actual| / actual), averaged over the test windows. */
    totalError: number | null;
    /** Number of held-out windows tested. */
    windows: number;
    /** Sum of actuals vs sum of forecast over the most recent held-out window. */
    actualTotal: number;
    forecastTotal: number;
}

const SEASON = 7;
const Z_80 = 1.2816;
const GRID = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];

export function forecastSeries(history: number[], horizon: number): ForecastResult {
    const h = Math.max(0, Math.floor(horizon));
    const series = history.map(v => (Number.isFinite(v) ? Math.max(0, v) : 0));
    if (h === 0) {
        return { method: 'mean', values: [], lower: [], upper: [], total: { value: 0, lower: 0, upper: 0 } };
    }
    if (series.length >= SEASON * 4) {
        return holtWinters(series, h);
    }
    if (series.length >= SEASON) {
        return holtLinear(series, h);
    }
    return meanForecast(series, h);
}

/**
 * Forecasts held-out windows of `days` from what came before them, to measure how
 * accurate the method is on this store's own data. Uses up to three consecutive windows
 * at the end of the history, so one unusual fortnight doesn't decide the score.
 */
export function backtest(history: number[], days = 14): BacktestResult {
    const d = Math.min(days, Math.floor(history.length / 3));
    if (d < 3) {
        return { days: 0, wape: null, totalError: null, windows: 0, actualTotal: 0, forecastTotal: 0 };
    }
    let absError = 0;
    let actualSum = 0;
    const totalErrors: number[] = [];
    let latest = { actualTotal: 0, forecastTotal: 0 };
    for (let w = 0; w < 3; w++) {
        const end = history.length - w * d;
        const train = history.slice(0, end - d);
        if (train.length < d * 2) break;
        const actual = history.slice(end - d, end);
        const predicted = forecastSeries(train, d).values;
        const actualTotal = sum(actual);
        const forecastTotal = sum(predicted);
        absError += sum(actual.map((a, i) => Math.abs(a - predicted[i])));
        actualSum += actualTotal;
        if (actualTotal > 0) totalErrors.push(Math.abs(forecastTotal - actualTotal) / actualTotal);
        if (w === 0) latest = { actualTotal, forecastTotal };
    }
    return {
        days: d,
        wape: actualSum > 0 ? absError / actualSum : null,
        totalError: totalErrors.length ? mean(totalErrors) : null,
        windows: totalErrors.length,
        ...latest,
    };
}

function holtWinters(y: number[], h: number): ForecastResult {
    let best: { sse: number; alpha: number; beta: number; gamma: number } | undefined;
    for (const alpha of GRID) {
        for (const beta of [0.01, 0.05, 0.1, 0.2]) {
            for (const gamma of [0.05, 0.1, 0.2, 0.3, 0.5]) {
                const { sse } = runHoltWinters(y, alpha, beta, gamma, 0);
                if (!best || sse < best.sse) best = { sse, alpha, beta, gamma };
            }
        }
    }
    const { alpha, beta, gamma } = best!;
    const { forecast, residuals } = runHoltWinters(y, alpha, beta, gamma, h);
    return withIntervals('holt-winters-weekly', forecast, residuals, alpha, beta);
}

function runHoltWinters(y: number[], alpha: number, beta: number, gamma: number, h: number) {
    const m = SEASON;
    const seasons = Math.floor(y.length / m);
    // Initial level/trend from the first two seasons, seasonal indices from season averages.
    let level = mean(y.slice(0, m));
    let trend = (mean(y.slice(m, 2 * m)) - mean(y.slice(0, m))) / m;
    const seasonAvgs = Array.from({ length: seasons }, (_, s) => mean(y.slice(s * m, s * m + m)));
    const seasonal = Array.from({ length: m }, (_, i) => mean(seasonAvgs.map((avg, s) => y[s * m + i] - avg)));

    let sse = 0;
    const residuals: number[] = [];
    for (let t = 0; t < y.length; t++) {
        const s = seasonal[t % m];
        const predicted = level + trend + s;
        if (t >= m) {
            const err = y[t] - predicted;
            sse += err * err;
            residuals.push(err);
        }
        const prevLevel = level;
        level = alpha * (y[t] - s) + (1 - alpha) * (level + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
        seasonal[t % m] = gamma * (y[t] - level) + (1 - gamma) * s;
    }
    // Dampen the trend so long horizons don't run away.
    const forecast = Array.from({ length: h }, (_, i) => level + dampedTrend(trend, i + 1) + seasonal[(y.length + i) % m]);
    return { sse, forecast, residuals };
}

function holtLinear(y: number[], h: number): ForecastResult {
    let best: { sse: number; alpha: number; beta: number } | undefined;
    for (const alpha of GRID) {
        for (const beta of [0.01, 0.05, 0.1, 0.2, 0.3]) {
            const { sse } = runHolt(y, alpha, beta, 0);
            if (!best || sse < best.sse) best = { sse, alpha, beta };
        }
    }
    const { forecast, residuals } = runHolt(y, best!.alpha, best!.beta, h);
    return withIntervals('holt-linear', forecast, residuals, best!.alpha, best!.beta);
}

function runHolt(y: number[], alpha: number, beta: number, h: number) {
    let level = y[0];
    let trend = y.length > 1 ? y[1] - y[0] : 0;
    let sse = 0;
    const residuals: number[] = [];
    for (let t = 1; t < y.length; t++) {
        const predicted = level + trend;
        const err = y[t] - predicted;
        sse += err * err;
        residuals.push(err);
        const prevLevel = level;
        level = alpha * y[t] + (1 - alpha) * (level + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }
    const forecast = Array.from({ length: h }, (_, i) => level + dampedTrend(trend, i + 1));
    return { sse, forecast, residuals };
}

function meanForecast(y: number[], h: number): ForecastResult {
    const avg = y.length ? mean(y) : 0;
    const residuals = y.map(v => v - avg);
    // The mean of n days is itself uncertain: like smoothing with alpha = 1/n.
    return withIntervals('mean', Array(h).fill(avg), residuals, y.length ? 1 / y.length : 0, 0);
}

/** Damped trend (phi = 0.95): sum_{i=1..k} phi^i * trend */
function dampedTrend(trend: number, k: number): number {
    const phi = 0.95;
    return trend * ((phi * (1 - Math.pow(phi, k))) / (1 - phi));
}

function withIntervals(method: ForecastMethod, forecast: number[], residuals: number[], alpha: number, beta: number): ForecastResult {
    const sd = residuals.length > 1 ? Math.sqrt(sum(residuals.map(r => r * r)) / (residuals.length - 1)) : 0;
    const values = forecast.map(v => Math.max(0, v));
    const h = forecast.length;
    // Standard exponential-smoothing error model: a shock on one future day also moves the
    // level (and the damped trend) used for the days after it, with weight
    // c_j = alpha * (1 + beta * (phi + ... + phi^j)) j days later (c_0 = 1). Daily variance
    // sums c_j^2 over the earlier shocks; the variance of the period total sums the square of
    // each shock's combined weight on the remaining days.
    const c = (j: number) => (j === 0 ? 1 : alpha * (1 + beta * dampedTrend(1, j)));
    const dailySd = forecast.map((_, i) => sd * Math.sqrt(sum(Array.from({ length: i + 1 }, (_, j) => c(j) ** 2))));
    // Residuals that alternate (e.g. an expensive item every few days) cancel out in a total;
    // residuals that run in streaks add up. Correct the total's variance for that.
    const longRun = longRunVarianceFactor(residuals, Math.min(SEASON, h - 1));
    const totalSd =
        sd * Math.sqrt(longRun * sum(Array.from({ length: h }, (_, k) => sum(Array.from({ length: h - k }, (_, j) => c(j))) ** 2)));
    const totalValue = sum(values);
    return {
        method,
        values,
        lower: forecast.map((v, i) => Math.max(0, v - Z_80 * dailySd[i])),
        upper: forecast.map((v, i) => Math.max(0, v + Z_80 * dailySd[i])),
        total: { value: totalValue, lower: Math.max(0, totalValue - Z_80 * totalSd), upper: totalValue + Z_80 * totalSd },
    };
}

/**
 * Long-run variance of the residuals relative to their plain variance (Newey-West, Bartlett
 * weights): about 1 for independent errors, below 1 when errors alternate, above 1 when they
 * run in streaks. Clamped so a short history can't produce an extreme correction.
 */
function longRunVarianceFactor(residuals: number[], maxLag: number): number {
    const n = residuals.length;
    if (n < 14 || maxLag < 1) return 1;
    const avg = mean(residuals);
    const centered = residuals.map(r => r - avg);
    const variance = sum(centered.map(r => r * r)) / n;
    if (variance === 0) return 1;
    let factor = 1;
    for (let lag = 1; lag <= maxLag; lag++) {
        let cov = 0;
        for (let t = lag; t < n; t++) cov += centered[t] * centered[t - lag];
        factor += 2 * (1 - lag / (maxLag + 1)) * (cov / n / variance);
    }
    return Math.min(3, Math.max(0.25, factor));
}

/**
 * Expected demand per day for an item with sparse sales (most products): a recency-
 * weighted average daily rate (last 28 days weigh 60%, the 28 before 40%).
 */
export function demandRate(dailyUnits: number[]): number {
    const recent = dailyUnits.slice(-28);
    const earlier = dailyUnits.slice(-56, -28);
    if (!recent.length) return 0;
    if (!earlier.length) return mean(recent);
    return 0.6 * mean(recent) + 0.4 * mean(earlier);
}

/** Standard deviation of daily units (for safety stock). */
export function demandStdDev(dailyUnits: number[]): number {
    const window = dailyUnits.slice(-56);
    if (window.length < 2) return 0;
    const avg = mean(window);
    return Math.sqrt(sum(window.map(v => (v - avg) ** 2)) / (window.length - 1));
}

function sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
}

function mean(values: number[]): number {
    return values.length ? sum(values) / values.length : 0;
}
