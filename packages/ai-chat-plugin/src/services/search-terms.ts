/**
 * Lower-cased words of a search, with simple English plurals reduced to their stem so that
 * "cameras" finds "Camera" and "watches" finds "Watch". Matched as substrings.
 */
export function searchTerms(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(word => word.length > 1)
        .map(word => {
            if (word.length <= 3) return word;
            if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
            if (/(ches|shes|xes|sses|zes)$/.test(word)) return word.slice(0, -2);
            if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
            return word;
        });
}
