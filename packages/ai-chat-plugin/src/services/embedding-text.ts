/** Text that represents a product or collection for semantic search. */

const MAX_EMBED_CHARS = 8000;

/** Removes HTML tags and entities and collapses whitespace (descriptions are rich text). */
export function stripHtml(html: string): string {
    return html
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Name and plain-text description of every translation. */
export function buildEmbeddingText(translations: Array<{ name?: string | null; description?: string | null }> | undefined): string {
    const parts: string[] = [];
    for (const t of translations ?? []) {
        if (t?.name) parts.push(String(t.name).trim());
        if (t?.description) parts.push(stripHtml(String(t.description)));
    }
    return parts.filter(Boolean).join('. ').slice(0, MAX_EMBED_CHARS).trim();
}
