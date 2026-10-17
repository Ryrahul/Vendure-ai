import { useCallback } from 'react';
import { useChannel } from '@vendure/dashboard';

/**
 * Headers for the AI chat REST endpoints.
 *
 * The channel comes from the dashboard's own active channel (`useChannel()`), never from
 * localStorage: `vendure-selected-channel-token` can be stale and point at a different
 * channel than the one the administrator is looking at, which would make the assistant
 * read and change the wrong channel.
 */
export function useAuthHeaders() {
    const { activeChannel } = useChannel();
    const channelToken = activeChannel?.token;
    return useCallback(
        (json = false): Record<string, string> => {
            const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
            const sessionToken = localStorage.getItem('vendure-session-token');
            if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
            if (channelToken) headers['vendure-token'] = channelToken;
            return headers;
        },
        [channelToken],
    );
}
