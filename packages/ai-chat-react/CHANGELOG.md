# Changelog

## 0.2.3

### Fixed

- **Prices always showed in dollars.** Product cards, the cart summary and order cards formatted every price as `$X.XX`. The default formatter now uses the store currency (`NPR 99.00`, `£11.88`); `formatPrice` receives the currency as a second argument (existing one-argument formatters keep working). Exported as `formatChatPrice`. Needs `@rahul_vendure/ai-chat-plugin` >= 0.4.1 for carts and orders (products since 0.3.0).
- README: documented the `channelToken` prop and private conversations.

## 0.2.2

- README: guest carts (pass the shopper's session token for guests too).

## 0.2.0

- **Conversations are private per visitor** (previously every visitor shared one conversation id).
- New `channelToken` option, sent as `vendure-token`, for storefronts on a non-default channel.
