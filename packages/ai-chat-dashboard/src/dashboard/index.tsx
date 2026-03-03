import { defineDashboardExtension } from '@vendure/dashboard';
import { AdminChatWidget } from './AdminChatWidget';
import React from 'react';

function AiChatPage() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 80px)',
            padding: '24px',
        }}>
            <h1 style={{
                fontSize: '24px',
                fontWeight: 600,
                marginBottom: '16px',
                color: 'var(--color-foreground, #0f172a)',
            }}>
                AI Chat Assistant
            </h1>
            <div style={{
                flex: 1,
                minHeight: 0,
                border: '1px solid var(--color-border, #e2e8f0)',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: 'var(--color-card, #fff)',
            }}>
                <AdminChatWidget />
            </div>
        </div>
    );
}

defineDashboardExtension({
    routes: [
        {
            path: '/extensions/ai-chat',
            component: () => <AiChatPage />,
            navMenuItem: {
                id: 'ai-chat',
                title: 'AI Chat',
                sectionId: 'ai',
            },
        },
    ],
    navSections: [
        {
            id: 'ai',
            title: 'AI',
            placement: 'top',
            order: 150,
        },
    ],
});
