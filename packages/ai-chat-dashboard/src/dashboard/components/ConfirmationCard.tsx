import React from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import type { PendingConfirmation } from '../types';

interface ConfirmationCardProps {
    confirmation: PendingConfirmation;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Shown under an assistant reply when the assistant requested a destructive action.
 * The action only runs if the administrator presses Confirm.
 */
export function ConfirmationCard({ confirmation, onConfirm, onCancel }: ConfirmationCardProps) {
    const status = confirmation.status ?? 'pending';
    const destructive = confirmation.toolName.startsWith('delete') || confirmation.toolName.startsWith('remove');
    const accent = destructive ? 'var(--destructive, #dc2626)' : 'var(--primary, #6366f1)';

    const button = (primary: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        padding: '6px 12px',
        borderRadius: 8,
        cursor: status === 'working' ? 'wait' : 'pointer',
        border: primary ? 'none' : '1px solid var(--border, #e2e8f0)',
        background: primary ? accent : 'var(--background, #fff)',
        color: primary ? '#fff' : 'var(--foreground, #0f172a)',
        opacity: status === 'working' ? 0.6 : 1,
    });

    return (
        <div
            role="group"
            aria-label="Action awaiting confirmation"
            style={{
                border: '1px solid var(--border, #e2e8f0)',
                borderLeft: `3px solid ${status === 'pending' || status === 'working' ? accent : 'var(--border, #e2e8f0)'}`,
                borderRadius: 8,
                background: 'var(--background, #fff)',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertTriangle style={{ width: 16, height: 16, color: accent, flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'var(--foreground, #0f172a)' }}>
                    <div style={{ fontWeight: 600 }}>
                        {status === 'confirmed' ? 'Done' : status === 'cancelled' ? 'Cancelled' : status === 'failed' ? 'Not done' : 'Confirm this action'}
                    </div>
                    <div style={{ color: 'var(--muted-foreground, #64748b)', marginTop: 2, wordBreak: 'break-word' }}>
                        {confirmation.description}
                    </div>
                    {confirmation.result && (
                        <div style={{ marginTop: 6, color: status === 'failed' ? 'var(--destructive, #dc2626)' : 'var(--foreground, #0f172a)' }}>
                            {confirmation.result}
                        </div>
                    )}
                </div>
            </div>

            {(status === 'pending' || status === 'working') && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onCancel} disabled={status === 'working'} style={button(false)}>
                        <X style={{ width: 14, height: 14 }} />
                        Cancel
                    </button>
                    <button type="button" onClick={onConfirm} disabled={status === 'working'} style={button(true)}>
                        {status === 'working' ? (
                            <Loader2 style={{ width: 14, height: 14, animation: 'ac-spin 1s linear infinite' }} />
                        ) : (
                            <Check style={{ width: 14, height: 14 }} />
                        )}
                        {destructive ? 'Confirm delete' : 'Confirm'}
                    </button>
                </div>
            )}
            <style>{'@keyframes ac-spin { to { transform: rotate(360deg); } }'}</style>
        </div>
    );
}
