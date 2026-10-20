import type { UIMessageChunk } from 'ai';

/**
 * Removes provider metadata (e.g. Azure/OpenAI response item ids) from the chunks sent to
 * the browser. The widget never needs it — the server keeps the conversation — and
 * `useChat` clients on older `ai` 6.x versions reject chunks with keys they don't know,
 * which silently cancels the stream.
 */
export function withoutProviderMetadata(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
    return stream.pipeThrough(
        new TransformStream<UIMessageChunk, UIMessageChunk>({
            transform(chunk, controller) {
                if (chunk && typeof chunk === 'object' && 'providerMetadata' in chunk) {
                    const { providerMetadata: _, ...rest } = chunk as UIMessageChunk & { providerMetadata?: unknown };
                    controller.enqueue(rest as UIMessageChunk);
                } else {
                    controller.enqueue(chunk);
                }
            },
        }),
    );
}
