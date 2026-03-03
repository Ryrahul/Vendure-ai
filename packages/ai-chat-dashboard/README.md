# @rahul_vendure/ai-chat-dashboard

AI chat assistant widget for the Vendure admin dashboard (React-based, Vendure 3.x).

Adds a chat page to the Vendure admin dashboard where admins can interact with an AI assistant.

## Installation

```bash
npm install @rahul_vendure/ai-chat-dashboard
```

## Usage

Add the plugin to your Vendure config:

```ts
import { AiChatDashboardPlugin } from '@rahul_vendure/ai-chat-dashboard';

const config: VendureConfig = {
    plugins: [
        AiChatDashboardPlugin,
        // ... other plugins
    ],
};
```

The plugin will:

1. Register a REST endpoint at `POST /admin-ai-chat/chat`
2. Add an "AI Chat" page to the dashboard sidebar (under Catalog section)

## Requirements

- Vendure 3.x with the React-based `@vendure/dashboard`
- The `DashboardPlugin` must be configured in your Vendure config
