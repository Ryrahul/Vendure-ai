import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { T } from './theme';

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled: boolean;
    /** Smaller box without the hint line (toolbar quick chat). */
    compact?: boolean;
}

const MAX_HEIGHT = 200;

export function ChatInput({ value, onChange, onSubmit, disabled, compact }: ChatInputProps) {
    const canSend = !!value.trim() && !disabled;
    const [focused, setFocused] = useState(false);
    const ref = useRef<HTMLTextAreaElement>(null);

    // Grow with the text, up to MAX_HEIGHT.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    }, [value]);

    return (
        <form
            onSubmit={e => {
                e.preventDefault();
                if (canSend) onSubmit();
            }}
        >
            <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 10px 10px 16px', borderRadius: 16,
                border: `1px solid ${focused ? T.primary : T.border}`, background: T.bg,
                boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--primary, #6366f1) 15%, transparent)' : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
            }}>
                <textarea
                    ref={ref}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            if (canSend) onSubmit();
                        }
                    }}
                    placeholder="Ask the AI assistant..."
                    rows={1}
                    style={{
                        flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
                        padding: '6px 0', lineHeight: 1.5, color: T.fg, fontFamily: 'inherit',
                        maxHeight: compact ? 120 : MAX_HEIGHT, minHeight: 24, fontSize: compact ? 13.5 : 14,
                    }}
                />
                <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="Send message"
                    style={{
                        width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: canSend ? 'pointer' : 'default',
                        background: canSend ? T.primary : T.muted, color: canSend ? T.primaryFg : T.mutedFg,
                        transition: 'background 0.15s',
                    }}
                >
                    <ArrowUp size={16} />
                </button>
            </div>
            {!compact && (
                <div style={{ fontSize: 11.5, color: T.mutedFg, textAlign: 'center', marginTop: 8 }}>
                    Enter to send · Shift + Enter for a new line · Changes that delete or affect staff and settings ask for confirmation
                </div>
            )}
        </form>
    );
}
