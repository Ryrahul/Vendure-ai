"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CartSummary: () => CartSummary,
  ChatMessage: () => ChatMessage,
  CollectionBadge: () => CollectionBadge,
  ProductCard: () => ProductCard,
  VendureAiChat: () => VendureAiChat,
  cn: () => cn,
  extractDataFromMessage: () => extractDataFromMessage,
  getMessageText: () => getMessageText,
  useVendureChat: () => useVendureChat
});
module.exports = __toCommonJS(index_exports);

// src/components/VendureAiChat.tsx
var import_react4 = require("react");
var import_lucide_react3 = require("lucide-react");

// src/hooks/use-vendure-chat.ts
var import_react = require("react");
var import_react2 = require("@ai-sdk/react");
var import_ai = require("ai");

// src/utils/extract-data.ts
function extractToolOutput(p, data) {
  const result = p.output;
  if (Array.isArray(result.products)) {
    for (const prod of result.products) {
      const product = prod;
      if (!data.products.find((existing) => existing.id === product.id)) {
        data.products.push(product);
      }
    }
  }
  if (Array.isArray(result.collections)) {
    for (const c of result.collections) {
      const collection = c;
      if (!data.collections.find((existing) => existing.id === collection.id)) {
        data.collections.push(collection);
      }
    }
  }
  if (result.addToCartAction) {
    data.addToCartAction = result.addToCartAction;
  }
  if (result.activeOrder) {
    data.activeOrder = result.activeOrder;
  }
}
function extractDataFromMessage(message) {
  const data = { products: [], collections: [] };
  if (!message.parts) return data;
  for (const part of message.parts) {
    const p = part;
    if (typeof p.type === "string" && p.type.startsWith("tool-") && p.state === "output-available" && p.output) {
      extractToolOutput(p, data);
    }
    if (p.type === "dynamic-tool" && p.state === "output-available" && p.output) {
      extractToolOutput(p, data);
    }
  }
  return data;
}
function getMessageText(message) {
  if (!message.parts) return "";
  return message.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
}

// src/hooks/use-vendure-chat.ts
function useVendureChat(options) {
  const { vendureUrl, authToken, chatEndpoint } = options;
  const transport = (0, import_react.useMemo)(
    () => new import_ai.DefaultChatTransport({
      api: chatEndpoint != null ? chatEndpoint : `${vendureUrl.replace(/\/$/, "")}/ai-assistant/stream`,
      headers: authToken ? () => ({ Authorization: `Bearer ${authToken}` }) : void 0
    }),
    [vendureUrl, authToken, chatEndpoint]
  );
  const { messages, sendMessage: rawSendMessage, status } = (0, import_react2.useChat)({
    id: "vendure-ai-chat",
    transport
  });
  const isLoading = status === "submitted" || status === "streaming";
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const latestData = lastAssistantMsg ? extractDataFromMessage(lastAssistantMsg) : { products: [], collections: [] };
  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;
    await rawSendMessage({ text: text.trim() });
  };
  return {
    messages,
    status,
    sendMessage,
    isLoading,
    getMessageText,
    getMessageData: extractDataFromMessage,
    products: latestData.products,
    collections: latestData.collections,
    activeOrder: latestData.activeOrder
  };
}

// src/utils/cn.ts
var import_clsx = require("clsx");
var import_tailwind_merge = require("tailwind-merge");
function cn(...inputs) {
  return (0, import_tailwind_merge.twMerge)((0, import_clsx.clsx)(inputs));
}

// src/components/ChatMessage.tsx
var import_react3 = __toESM(require("react"));
var import_react_markdown = __toESM(require("react-markdown"));

// src/components/ProductCard.tsx
var import_lucide_react = require("lucide-react");
var import_jsx_runtime = require("react/jsx-runtime");
function ProductCard({ product, onNavigate, formatPrice, addingToCart, onAddToCart, className }) {
  const handleClick = (e) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(`/product/${product.slug}`);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("flex gap-2 rounded-md border bg-background p-2", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "a",
      {
        href: `/product/${product.slug}`,
        onClick: handleClick,
        className: "relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted",
        children: product.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "img",
          {
            src: product.image,
            alt: product.name,
            className: "h-full w-full object-cover",
            loading: "lazy"
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-muted-foreground text-xs flex items-center justify-center h-full", children: "No img" })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "a",
        {
          href: `/product/${product.slug}`,
          onClick: handleClick,
          className: "block",
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "font-medium text-foreground text-sm line-clamp-1 hover:underline", children: product.name })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-primary font-semibold text-sm", children: formatPrice(product.price) })
    ] }),
    product.variantId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        onClick: onAddToCart,
        disabled: addingToCart,
        className: "self-center shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50",
        "aria-label": `Add ${product.name} to cart`,
        children: [
          addingToCart ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Loader2, { className: "h-3 w-3 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ShoppingCart, { className: "h-3 w-3" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sr-only sm:not-sr-only", children: "Add" })
        ]
      }
    )
  ] });
}

// src/components/CollectionBadge.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function CollectionBadge({ collection, onNavigate, className }) {
  const handleClick = (e) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(`/collection/${collection.slug}`);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "a",
    {
      href: `/collection/${collection.slug}`,
      onClick: handleClick,
      className: cn(
        "inline-flex items-center rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground hover:bg-background",
        className
      ),
      children: collection.name
    }
  );
}

// src/components/CartSummary.tsx
var import_lucide_react2 = require("lucide-react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function CartSummary({ order, formatPrice, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: cn("mt-3 rounded-md border bg-background p-3 space-y-2", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center justify-between text-xs font-medium text-muted-foreground", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.ShoppingCart, { className: "h-3 w-3" }),
        "Your Cart (",
        order.totalQuantity,
        " item",
        order.totalQuantity !== 1 ? "s" : "",
        ")"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "font-semibold text-foreground", children: formatPrice(order.totalWithTax) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "space-y-1.5", children: order.lines.map((line) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center justify-between text-sm", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium", children: [
          line.quantity,
          "x"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "truncate", children: line.productName })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "shrink-0 text-xs text-muted-foreground ml-2", children: formatPrice(line.linePriceWithTax) })
    ] }, line.orderLineId)) })
  ] });
}

// src/components/ChatMessage.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function ChatMessage({
  message,
  onNavigate,
  renderProduct,
  renderCollection,
  renderCartSummary,
  formatPrice,
  addingToCart,
  onAddToCartClick
}) {
  const text = getMessageText(message);
  const data = message.role === "assistant" ? extractDataFromMessage(message) : null;
  if (message.role === "assistant" && !text && !(data == null ? void 0 : data.products.length) && !(data == null ? void 0 : data.collections.length) && !(data == null ? void 0 : data.activeOrder)) {
    return null;
  }
  const isUser = message.role === "user";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: cn("flex", isUser ? "justify-end" : "justify-start"), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      className: cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      ),
      children: [
        message.role === "assistant" && text ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "chat-markdown max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_img]:hidden [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_react_markdown.default, { children: text }) }) : message.role === "user" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "whitespace-pre-wrap", children: text }) : null,
        data && data.collections.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "mt-2 flex flex-wrap gap-1.5", children: data.collections.map(
          (c) => renderCollection ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_react3.default.Fragment, { children: renderCollection(c) }, c.id) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CollectionBadge, { collection: c, onNavigate }, c.id)
        ) }),
        (data == null ? void 0 : data.activeOrder) && data.activeOrder.lines.length > 0 && (renderCartSummary ? renderCartSummary(data.activeOrder) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CartSummary, { order: data.activeOrder, formatPrice })),
        data && data.products.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "mt-3 space-y-2", children: data.products.map(
          (p) => renderProduct ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_react3.default.Fragment, { children: renderProduct(p) }, p.id) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            ProductCard,
            {
              product: p,
              onNavigate,
              formatPrice,
              addingToCart: addingToCart === p.variantId,
              onAddToCart: () => onAddToCartClick(p.variantId, p.name)
            },
            p.id
          )
        ) })
      ]
    }
  ) });
}

// src/components/VendureAiChat.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var DEFAULT_QUICK_ACTIONS = [
  "What do you sell?",
  "Show me your collections",
  "Help me find a gift",
  "What's popular?"
];
var DEFAULT_WELCOME = "Hi there! I'm your shopping assistant. I can help you find products, browse collections, check prices, and even add items to your cart. What are you looking for today?";
function VendureAiChat({
  vendureUrl,
  authToken,
  chatEndpoint,
  position = "bottom-right",
  title = "Shopping Assistant",
  placeholder = "Ask about products, collections, prices...",
  welcomeMessage = DEFAULT_WELCOME,
  quickActions = DEFAULT_QUICK_ACTIONS,
  onAddToCart,
  onCartUpdate,
  onNavigate,
  renderProduct,
  renderCollection,
  renderCartSummary,
  className,
  formatPrice = defaultFormatPrice
}) {
  const [isOpen, setIsOpen] = (0, import_react4.useState)(false);
  const [inputValue, setInputValue] = (0, import_react4.useState)("");
  const [addingToCart, setAddingToCart] = (0, import_react4.useState)(null);
  const scrollRef = (0, import_react4.useRef)(null);
  const processedActionsRef = (0, import_react4.useRef)(/* @__PURE__ */ new Set());
  const { messages, sendMessage, status, isLoading } = useVendureChat({
    vendureUrl,
    authToken,
    chatEndpoint
  });
  (0, import_react4.useEffect)(() => {
    var _a;
    (_a = scrollRef.current) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);
  (0, import_react4.useEffect)(() => {
    var _a;
    if (status !== "ready") return;
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistantMsg) return;
    const data = extractDataFromMessage(lastAssistantMsg);
    if (data.activeOrder && onCartUpdate && !processedActionsRef.current.has(lastAssistantMsg.id + "-cartupdate")) {
      processedActionsRef.current.add(lastAssistantMsg.id + "-cartupdate");
      onCartUpdate(data.activeOrder);
    }
    if (data.addToCartAction && !processedActionsRef.current.has(lastAssistantMsg.id + "-cart")) {
      processedActionsRef.current.add(lastAssistantMsg.id + "-cart");
      handleAddToCartAction(
        data.addToCartAction.variantId,
        (_a = data.addToCartAction.productName) != null ? _a : "Item",
        data.addToCartAction.quantity
      );
    }
  }, [messages, status]);
  async function handleAddToCartAction(variantId, productName, quantity = 1) {
    if (addingToCart || !onAddToCart) return;
    setAddingToCart(variantId);
    try {
      await onAddToCart(variantId, quantity, productName);
    } catch (e) {
    } finally {
      setAddingToCart(null);
    }
  }
  async function handleAddToCartClick(variantId, productName, quantity = 1) {
    if (!onAddToCart) return;
    setAddingToCart(variantId);
    try {
      await onAddToCart(variantId, quantity, productName);
    } catch (e) {
    } finally {
      setAddingToCart(null);
    }
  }
  async function handleSend(text) {
    if (!text.trim() || isLoading) return;
    setInputValue("");
    await sendMessage(text.trim());
  }
  function handleSubmit(e) {
    e.preventDefault();
    handleSend(inputValue);
  }
  const isInline = position === "inline";
  if (isInline) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: cn("flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background", className), children: renderPanel() });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      className: cn(
        "fixed z-[9999]",
        position === "bottom-right" ? "bottom-6 right-6" : "bottom-6 left-6",
        className
      ),
      children: [
        isOpen && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "fixed inset-0 z-[-1]", onClick: () => setIsOpen(false) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "div",
            {
              className: cn(
                "absolute bottom-[4.5rem] flex h-[80vh] max-h-[600px] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-xl animate-in fade-in slide-in-from-bottom-2",
                position === "bottom-right" ? "right-0" : "left-0"
              ),
              children: renderPanel()
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            onClick: () => setIsOpen(!isOpen),
            className: "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90",
            "aria-label": isOpen ? "Close chat" : "Open chat",
            children: isOpen ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.X, { className: "h-6 w-6" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.MessageCircle, { className: "h-6 w-6" })
          }
        )
      ]
    }
  );
  function renderPanel() {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex shrink-0 items-center justify-between border-b p-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h2", { className: "flex items-center gap-2 text-left font-semibold", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Store, { className: "h-5 w-5 text-primary" }),
          title
        ] }),
        !isInline && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            onClick: () => setIsOpen(false),
            className: "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            "aria-label": "Close",
            children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.X, { className: "h-4 w-4" })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "min-h-0 flex-1 overflow-y-auto p-4", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "space-y-4", children: [
        messages.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "space-y-4 py-4", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "flex justify-start", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: welcomeMessage }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "flex flex-wrap gap-2", children: quickActions.map((action) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "button",
            {
              onClick: () => handleSend(action),
              disabled: isLoading,
              className: "inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Sparkles, { className: "h-3 w-3 text-primary" }),
                action
              ]
            },
            action
          )) })
        ] }),
        messages.map((msg) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          ChatMessage,
          {
            message: msg,
            onNavigate,
            renderProduct,
            renderCollection,
            renderCartSummary,
            formatPrice,
            addingToCart,
            onAddToCartClick: handleAddToCartClick
          },
          msg.id
        )),
        isLoading && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "flex justify-start", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-2 rounded-lg bg-muted px-3 py-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Loader2, { className: "h-4 w-4 animate-spin text-muted-foreground" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-xs text-muted-foreground", children: status === "streaming" ? "Responding..." : "Thinking..." })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { ref: scrollRef })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("form", { onSubmit: handleSubmit, className: "flex shrink-0 gap-2 border-t p-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            type: "text",
            value: inputValue,
            onChange: (e) => setInputValue(e.target.value),
            placeholder,
            disabled: isLoading,
            className: "flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "submit",
            disabled: isLoading || !inputValue.trim(),
            className: "inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50",
            "aria-label": "Send message",
            children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Loader2, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Send, { className: "h-4 w-4" })
          }
        )
      ] })
    ] });
  }
}
function defaultFormatPrice(price) {
  return `$${(price / 100).toFixed(2)}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CartSummary,
  ChatMessage,
  CollectionBadge,
  ProductCard,
  VendureAiChat,
  cn,
  extractDataFromMessage,
  getMessageText,
  useVendureChat
});
//# sourceMappingURL=index.js.map