type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Passes system instructions through the AI SDK's dedicated `system` option instead of as
 * a message in `messages` (which the SDK flags as a prompt-injection risk). Only our own
 * leading system prompt is ever a system message; client history is sanitized to
 * user/assistant before it gets here.
 */
export function toModelInput(messages: ChatMessage[]): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
    const system = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n\n');
    return {
        ...(system ? { system } : {}),
        messages: messages.filter((m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'system'),
    };
}
