import React, { useState } from 'react';
import { api } from '@vendure/dashboard';
import { Database, Loader2, Check, AlertCircle } from 'lucide-react';

type EmbedStatus = 'idle' | 'loading' | 'success' | 'error';

const TRIGGER_EMBED_ALL = `
    mutation TriggerEmbedAll {
        triggerEmbedAll {
            jobId
            message
        }
    }
`;

export function EmbedAllButton() {
    const [status, setStatus] = useState<EmbedStatus>('idle');

    const handleEmbedAll = async () => {
        if (status === 'loading') return;
        setStatus('loading');

        try {
            const result = await api.mutate(TRIGGER_EMBED_ALL);
            if (!result.triggerEmbedAll) throw new Error('No result');
            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
        } catch {
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    const Icon = status === 'loading' ? Loader2
        : status === 'success' ? Check
        : status === 'error' ? AlertCircle
        : Database;

    const label = status === 'loading' ? 'Embedding...'
        : status === 'success' ? 'Done'
        : status === 'error' ? 'Failed'
        : 'Embed All';

    return (
        <button
            onClick={handleEmbedAll}
            disabled={status === 'loading'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', borderRadius: 6, border: 'none',
                background: 'transparent', cursor: status === 'loading' ? 'wait' : 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                color: status === 'success' ? '#10b981'
                    : status === 'error' ? '#ef4444'
                    : 'var(--muted-foreground, #64748b)',
                transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (status === 'idle') e.currentTarget.style.color = 'var(--foreground, #0f172a)'; }}
            onMouseLeave={e => { if (status === 'idle') e.currentTarget.style.color = 'var(--muted-foreground, #64748b)'; }}
        >
            <Icon style={{
                width: 12, height: 12,
                ...(status === 'loading' ? { animation: 'ac-spin 1s linear infinite' } : {}),
            }} />
            {label}
            <style>{`@keyframes ac-spin { to { transform: rotate(360deg); } }`}</style>
        </button>
    );
}
