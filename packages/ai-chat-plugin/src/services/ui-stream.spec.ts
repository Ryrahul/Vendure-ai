import { describe, expect, it } from 'vitest';
import { convertArrayToReadableStream, convertReadableStreamToArray } from 'ai/test';

import { withoutProviderMetadata } from './ui-stream';

describe('withoutProviderMetadata', () => {
    it('drops providerMetadata and leaves everything else as is', async () => {
        const chunks: any[] = [
            { type: 'start' },
            { type: 'tool-output-available', toolCallId: 'c1', output: { products: [] }, providerMetadata: { azure: { itemId: 'fc_1' } } },
            { type: 'text-delta', id: 't', delta: 'Hi' },
            { type: 'text-end', id: 't', providerMetadata: { azure: { phase: 'final_answer' } } },
            { type: 'finish', finishReason: 'stop' },
        ];
        const out = await convertReadableStreamToArray(withoutProviderMetadata(convertArrayToReadableStream(chunks)));
        expect(out).toEqual([
            { type: 'start' },
            { type: 'tool-output-available', toolCallId: 'c1', output: { products: [] } },
            { type: 'text-delta', id: 't', delta: 'Hi' },
            { type: 'text-end', id: 't' },
            { type: 'finish', finishReason: 'stop' },
        ]);
    });
});
