import React, { useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled: boolean;
}

export function ChatInput({ value, onChange, onSubmit, disabled }: ChatInputProps) {
    const canSend = value.trim() && !disabled;
    const [focused, setFocused] = useState(false);

    return (
        <form
            style={{ padding: '16px 20px' }}
            onSubmit={e => {
                e.preventDefault();
                if (canSend) onSubmit();
            }}
        >
            <div
                style={{
                    display: 'flex', alignItems: 'flex-end', gap: 12,
                    borderRadius: 12,
                    border: `1px solid ${focused ? 'var(--primary, #6366f1)' : 'var(--border, #e2e8f0)'}`,
                    background: 'var(--background, #fff)',
                    padding: '10px 16px',
                    boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (canSend) onSubmit();
                        }
                    }}
                    placeholder="Ask the AI assistant..."
                    disabled={disabled}
                    rows={1}
                    style={{
                        flex: 1, resize: 'none', border: 'none', outline: 'none',
                        background: 'transparent', padding: '6px 0',
                        fontSize: 14, lineHeight: 1.5,
                        color: 'var(--foreground, #0f172a)',
                        maxHeight: 120, minHeight: 32,
                        fontFamily: 'inherit',
                    }}
                />
                <button
                    type="submit"
                    disabled={!canSend}
                    style={{
                        width: 28, height: 28, borderRadius: 8,
                        border: 'none', cursor: canSend ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginBottom: 2,
                        background: canSend ? 'var(--primary, #6366f1)' : 'var(--muted, #f1f5f9)',
                        color: canSend ? '#fff' : 'var(--muted-foreground, #94a3b8)',
                        transition: 'background 0.15s, transform 0.1s',
                    }}
                >
                    <ArrowUp style={{ width: 14, height: 14 }} />
                </button>
            </div>
        </form>
    );
}
