import React, { useEffect, useState } from 'react';

/** Seconds since the component mounted (i.e. since the request started). */
function useElapsedSeconds() {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const started = Date.now();
        const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(timer);
    }, []);
    return seconds;
}

/**
 * Shown next to the loading dots: nothing for quick answers, then a note that research
 * (web searches, forecasts) can take a while, so a long wait doesn't look like a hang.
 */
export function LoadingStatus({ fontSize = 12 }: { fontSize?: number }) {
    const seconds = useElapsedSeconds();
    if (seconds < 6) return null;
    const text =
        seconds < 20
            ? 'Working on it…'
            : seconds < 60
              ? 'Still working — answers that search the web or analyse sales can take a minute.'
              : 'Still researching — web searches are slow right now. You can keep this page open.';
    return (
        <span style={{ fontSize, color: 'var(--muted-foreground, #64748b)', marginLeft: 8 }}>
            {text} <span style={{ fontVariantNumeric: 'tabular-nums' }}>{seconds}s</span>
        </span>
    );
}
