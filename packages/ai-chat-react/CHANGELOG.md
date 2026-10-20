# Changelog

## 0.2.4

### Fixed

- **The assistant didn't see the shopper's cart after they got a session.** `useChat` keeps its transport from the first render, so a new `authToken` (a guest's session after their first add-to-cart, or a login) was never sent; the assistant then reported an empty cart. Tokens are now read on every request.
- **Peer dependencies pinned to `ai` 6 and `@ai-sdk/react` 3.** The open ranges (`>=6`, `>=3`) let npm install `ai` 7 / `@ai-sdk/react` 4, which don't match the plugin's v6 stream. Install with `npm install @rahul_vendure/ai-chat-react ai@^6 @ai-sdk/react@^3`.
- Replies no longer disappear with Azure OpenAI and older `ai` 6.x clients — fixed on the server in `@rahul_vendure/ai-chat-plugin` 0.5.0 (provider metadata is no longer streamed).

## 0.2.3

### Fixed

- **Prices always showed in dollars.** Product cards, the cart summary and order cards formatted every price as `$X.XX`. The default formatter now uses the store currency (`NPR 99.00`, `£11.88`); `formatPrice` receives the currency as a second argument (existing one-argument formatters keep working). Exported as `formatChatPrice`. Needs `@rahul_vendure/ai-chat-plugin` >= 0.4.1 for carts and orders (products since 0.3.0).
- README: documented the `channelToken` prop and private conversations.

## 0.2.2

- README: guest carts (pass the shopper's session token for guests too).

## 0.2.0

- **Conversations are private per visitor** (previously every visitor shared one conversation id).
- New `channelToken` option, sent as `vendure-token`, for storefronts on a non-default channel.
