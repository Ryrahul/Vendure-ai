import { describe, expect, it } from 'vitest';

import { searchTerms } from './admin-product-tools';

describe('searchTerms', () => {
    it('splits into words and reduces simple plurals', () => {
        expect(searchTerms('Cameras')).toEqual(['camera']);
        expect(searchTerms('running shoes')).toEqual(['running', 'shoe']);
        expect(searchTerms('watches, batteries & glasses')).toEqual(['watch', 'battery', 'glass']);
        expect(searchTerms('USB cable')).toEqual(['usb', 'cable']);
        expect(searchTerms('Moisturiser 50ml')).toEqual(['moisturiser', '50ml']);
        expect(searchTerms('  ')).toEqual([]);
    });
});
