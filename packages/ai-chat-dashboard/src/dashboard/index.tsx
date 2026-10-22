import { defineDashboardExtension } from '@vendure/dashboard';
import { AdminChatWidget } from './AdminChatWidget';
import { AiChatToolbarButton } from './components/AiChatToolbarButton';
import { EmbedAllButton } from './components/EmbedAllButton';
import React from 'react';
import { Sparkles } from 'lucide-react';

function AiChatPage() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100svh - 64px)', minHeight: 0 }}>
            <AdminChatWidget />
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
            icon: Sparkles,
            placement: 'top',
            order: 150,
        },
    ],
    actionBarItems: [
        {
            pageId: 'global-setting-detail',
            id: 'embed-all-button',
            component: () => <EmbedAllButton />,
        },
    ],
    toolbarItems: [
        {
            id: 'ai-chat-toolbar',
            component: AiChatToolbarButton,
            position: { itemId: 'alerts', order: 'before' },
        },
    ],
});
