/**
 * Colours from the dashboard's theme (CSS variables), with fallbacks, so the chat follows
 * light/dark mode and custom themes.
 */
export const T = {
    bg: 'var(--background, #fff)',
    fg: 'var(--foreground, #0f172a)',
    muted: 'var(--muted, #f1f5f9)',
    mutedFg: 'var(--muted-foreground, #64748b)',
    border: 'var(--border, #e2e8f0)',
    primary: 'var(--primary, #6366f1)',
    primaryFg: 'var(--primary-foreground, #fff)',
    accent: 'var(--accent, #f1f5f9)',
    card: 'var(--card, var(--background, #fff))',
    danger: 'var(--destructive, #dc2626)',
};

/** Shared CSS for the chat (Markdown, animations); rendered once by the chat components. */
export const CHAT_CSS = `
.ac-md { font-size: 14px; line-height: 1.65; color: ${T.fg}; overflow-wrap: anywhere; }
.ac-md > :first-child { margin-top: 0; }
.ac-md > :last-child { margin-bottom: 0; }
.ac-md p { margin: 8px 0; }
.ac-md strong { font-weight: 600; }
.ac-md h1, .ac-md h2, .ac-md h3, .ac-md h4 { font-weight: 600; line-height: 1.35; margin: 18px 0 8px; }
.ac-md h1 { font-size: 18px; } .ac-md h2 { font-size: 16px; } .ac-md h3, .ac-md h4 { font-size: 14px; }
.ac-md ul, .ac-md ol { margin: 6px 0 10px; padding-left: 22px; }
.ac-md ul { list-style: disc; } .ac-md ol { list-style: decimal; }
.ac-md li { margin: 3px 0; }
.ac-md li > p { margin: 0; }
.ac-md a { color: ${T.primary}; text-decoration: underline; text-underline-offset: 2px; }
.ac-md code { background: ${T.muted}; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
.ac-md pre { background: ${T.muted}; padding: 12px; border-radius: 8px; overflow-x: auto; }
.ac-md pre code { background: none; padding: 0; }
.ac-md blockquote { border-left: 3px solid ${T.border}; margin: 8px 0; padding: 2px 12px; color: ${T.mutedFg}; }
.ac-md hr { border: none; border-top: 1px solid ${T.border}; margin: 14px 0; }
.ac-md table { border-collapse: separate; border-spacing: 0; width: 100%; margin: 10px 0; font-size: 13px;
    border: 1px solid ${T.border}; border-radius: 8px; overflow: hidden; display: block; overflow-x: auto; }
.ac-md th, .ac-md td { padding: 7px 12px; text-align: left; border-bottom: 1px solid ${T.border}; white-space: nowrap; }
.ac-md th { background: ${T.muted}; font-weight: 600; font-size: 12px; color: ${T.mutedFg}; }
.ac-md tr:last-child td { border-bottom: none; }
.ac-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${T.mutedFg}; animation: ac-bounce 0.9s infinite ease-in-out; }
@keyframes ac-bounce { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@keyframes ac-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.ac-msg { animation: ac-fade-in 0.18s ease-out; }
.ac-scroll::-webkit-scrollbar { width: 8px; }
.ac-scroll::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 8px; }
`;
