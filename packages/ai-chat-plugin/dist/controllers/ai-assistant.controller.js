"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AiAssistantController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiAssistantController = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const ai_chat_service_1 = require("../services/ai-chat.service");
const conversation_cache_service_1 = require("../services/conversation-cache.service");
/**
 * REST endpoints for the AI shopping assistant.
 * - POST /ai-assistant/chat — non-streaming JSON response (backward compatible)
 * - POST /ai-assistant/stream — streaming response using Vercel AI SDK data stream protocol
 */
let AiAssistantController = AiAssistantController_1 = class AiAssistantController {
    constructor(requestContextService, customerService, sessionService, configService, aiChatService, conversationCacheService) {
        this.requestContextService = requestContextService;
        this.customerService = customerService;
        this.sessionService = sessionService;
        this.configService = configService;
        this.aiChatService = aiChatService;
        this.conversationCacheService = conversationCacheService;
        this.logger = new common_1.Logger(AiAssistantController_1.name);
    }
    /**
     * Helper: extract user message and conversation history from the request body.
     * Supports two formats:
     * 1. Simple: { message: "hello", history: [{role, content}] }
     * 2. AI SDK: { messages: [UIMessage, ...] } (sent by DefaultChatTransport / useChat())
     */
    extractMessageAndHistory(body) {
        var _a, _b;
        // AI SDK format: messages array with parts
        if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
            const msgs = body.messages;
            const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');
            const message = lastUserMsg ? this.getTextFromUIMessage(lastUserMsg) : '';
            const lastUserIndex = msgs.lastIndexOf(lastUserMsg);
            const historyMsgs = lastUserIndex > 0 ? msgs.slice(0, lastUserIndex) : [];
            const history = historyMsgs
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({
                role: m.role,
                content: m.role === 'assistant'
                    ? this.getAssistantTextWithToolContext(m)
                    : this.getTextFromUIMessage(m),
            }))
                .filter(m => m.content.length > 0);
            return { message: message.trim(), history };
        }
        // Simple format: { message, history }
        return {
            message: ((_a = body.message) !== null && _a !== void 0 ? _a : '').trim(),
            history: ((_b = body.history) !== null && _b !== void 0 ? _b : []).map(msg => ({
                role: msg.role,
                content: msg.content,
            })),
        };
    }
    /** Extract plain text from a UIMessage (handles both parts and content) */
    getTextFromUIMessage(msg) {
        if (Array.isArray(msg.parts)) {
            return msg.parts
                .filter(p => p.type === 'text' && typeof p.text === 'string')
                .map(p => p.text)
                .join('');
        }
        if (typeof msg.content === 'string') {
            return msg.content;
        }
        return '';
    }
    /** Extract assistant text + tool result summaries for conversation context */
    getAssistantTextWithToolContext(msg) {
        if (!Array.isArray(msg.parts)) {
            return typeof msg.content === 'string' ? msg.content : '';
        }
        const parts = [];
        for (const p of msg.parts) {
            if (p.type === 'text' && typeof p.text === 'string') {
                parts.push(p.text);
            }
            if (typeof p.type === 'string' && p.state === 'output-available' && p.output) {
                const output = p.output;
                if (typeof output.summary === 'string') {
                    parts.push(`[Tool result: ${output.summary}]`);
                }
            }
        }
        return parts.join('\n');
    }
    /**
     * Resolve conversation history: prefer server-side cache when conversationId
     * is present, otherwise fall back to the history sent in the request body.
     */
    async resolveHistory(body) {
        var _a;
        const { message, history: bodyHistory } = this.extractMessageAndHistory(body);
        const conversationId = body.conversationId;
        if (conversationId) {
            // Fetch history from server-side cache
            const cached = await this.conversationCacheService.getHistory(conversationId);
            const history = (_a = cached === null || cached === void 0 ? void 0 : cached.messages) !== null && _a !== void 0 ? _a : [];
            this.logger.log(`[CACHE] Conversation ${conversationId}: ${history.length} cached messages (skipped ${bodyHistory.length} from request body)`);
            return { message, history, conversationId };
        }
        // No conversationId — fall back to history from request body (backward compatible)
        return { message, history: bodyHistory };
    }
    /**
     * Helper: extract auth context from request
     */
    async resolveAuthContext(req) {
        var _a, _b, _c;
        const authHeader = req.get('Authorization');
        const tokenMatch = authHeader === null || authHeader === void 0 ? void 0 : authHeader.trim().match(/^bearer\s(.+)$/i);
        const sessionToken = tokenMatch === null || tokenMatch === void 0 ? void 0 : tokenMatch[1];
        this.logger.log(`[AUTH] Session token present: ${!!sessionToken}`);
        let session;
        if (sessionToken) {
            session = await this.sessionService.getSessionFromToken(sessionToken);
            this.logger.log(`[AUTH] Session found: ${!!session}, userId: ${(_b = (_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 'NONE'}`);
        }
        const ctx = await this.requestContextService.fromRequest(req, undefined, undefined, session);
        this.logger.log(`[AUTH] ctx.activeUserId: ${(_c = ctx.activeUserId) !== null && _c !== void 0 ? _c : 'NONE'}`);
        let customerId;
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            customerId = customer === null || customer === void 0 ? void 0 : customer.id;
            this.logger.log(`[AUTH] customerId: ${customerId !== null && customerId !== void 0 ? customerId : 'NONE'}`);
        }
        return { ctx, customerId };
    }
    /**
     * Non-streaming endpoint (backward compatible).
     * Returns the full JSON response after all tool calls complete.
     */
    async chat(body, req) {
        const { ctx, customerId } = await this.resolveAuthContext(req);
        const { message: query, history, conversationId } = await this.resolveHistory(body);
        if (!query) {
            return {
                message: 'Hi! I\'m your shopping assistant. How can I help you today? You can ask me about products, collections, your orders, or anything about our store.',
                products: [],
                collections: [],
            };
        }
        const result = await this.aiChatService.chat(ctx, query, history, customerId);
        // Cache the new turn if conversationId is present
        if (conversationId) {
            await this.conversationCacheService.appendMessages(conversationId, query, result.message, customerId);
        }
        return {
            message: result.message,
            products: result.products,
            collections: result.collections,
            addToCartAction: result.addToCartAction,
            orders: result.orders,
            activeOrder: result.activeOrder,
            setShippingAddressAction: result.setShippingAddressAction,
            setBillingAddressAction: result.setBillingAddressAction,
            setShippingMethodAction: result.setShippingMethodAction,
        };
    }
    /**
     * Streaming endpoint.
     * Returns a Vercel AI SDK–compatible data stream.
     * The frontend can consume this with useChat() from @ai-sdk/react.
     *
     * Structured data (products, collections, cart, orders, actions) is sent
     * as data stream annotations (custom JSON messages) alongside the text stream.
     */
    async stream(body, req, res) {
        var _a;
        const { ctx, customerId } = await this.resolveAuthContext(req);
        const { message: query, history, conversationId } = await this.resolveHistory(body);
        if (!query) {
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json({
                message: 'Hi! I\'m your shopping assistant. How can I help you today?',
                products: [],
                collections: [],
            });
            return;
        }
        const streamResult = this.aiChatService.streamChat(ctx, query, history, customerId);
        // Use the AI SDK's toUIMessageStreamResponse for useChat() compatibility
        const streamResponse = streamResult.toUIMessageStreamResponse();
        // Forward status and headers
        res.status((_a = streamResponse.status) !== null && _a !== void 0 ? _a : 200);
        streamResponse.headers.forEach((value, key) => {
            res.setHeader(key, value);
        });
        // Pipe the body stream to the express response
        if (streamResponse.body) {
            const reader = streamResponse.body.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    res.write(value);
                }
            }
            catch (e) {
                this.logger.error(`Stream error: ${e}`);
            }
            finally {
                res.end();
            }
        }
        else {
            res.end();
        }
        // Cache the new conversation turn after the stream completes.
        // We await the full text from the streamResult (which is already
        // consumed by the stream pipe above, so .text resolves immediately).
        if (conversationId) {
            try {
                const fullText = await streamResult.text;
                await this.conversationCacheService.appendMessages(conversationId, query, fullText, customerId);
            }
            catch (e) {
                this.logger.error(`Failed to cache conversation turn: ${e}`);
            }
        }
    }
};
exports.AiAssistantController = AiAssistantController;
__decorate([
    (0, common_1.Post)('chat'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiAssistantController.prototype, "chat", null);
__decorate([
    (0, common_1.Post)('stream'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AiAssistantController.prototype, "stream", null);
exports.AiAssistantController = AiAssistantController = AiAssistantController_1 = __decorate([
    (0, common_1.Controller)('ai-assistant'),
    __metadata("design:paramtypes", [core_1.RequestContextService,
        core_1.CustomerService,
        core_1.SessionService,
        core_1.ConfigService,
        ai_chat_service_1.AiChatService,
        conversation_cache_service_1.ConversationCacheService])
], AiAssistantController);
//# sourceMappingURL=ai-assistant.controller.js.map