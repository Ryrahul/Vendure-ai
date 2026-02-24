// src/components/VendureAiChat.tsx
import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Store, Sparkles, Send, Loader2 as Loader22 } from "lucide-react";

// src/hooks/use-vendure-chat.ts
import { useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

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
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: chatEndpoint != null ? chatEndpoint : `${vendureUrl.replace(/\/$/, "")}/ai-assistant/stream`,
      headers: authToken ? () => ({ Authorization: `Bearer ${authToken}` }) : void 0
    }),
    [vendureUrl, authToken, chatEndpoint]
  );
  const { messages, sendMessage: rawSendMessage, status } = useChat({
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
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// src/components/ChatMessage.tsx
import React from "react";
import ReactMarkdown from "react-markdown";

// src/components/ProductCard.tsx
import { ShoppingCart, Loader2 } from "lucide-react";
import { jsx, jsxs } from "react/jsx-runtime";
function ProductCard({ product, onNavigate, formatPrice, addingToCart, onAddToCart, className }) {
  const handleClick = (e) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(`/product/${product.slug}`);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: cn("flex gap-2 rounded-md border bg-background p-2", className), children: [
    /* @__PURE__ */ jsx(
      "a",
      {
        href: `/product/${product.slug}`,
        onClick: handleClick,
        className: "relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted",
        children: product.image ? /* @__PURE__ */ jsx(
          "img",
          {
            src: product.image,
            alt: product.name,
            className: "h-full w-full object-cover",
            loading: "lazy"
          }
        ) : /* @__PURE__ */ jsx("span", { className: "text-muted-foreground text-xs flex items-center justify-center h-full", children: "No img" })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsx(
        "a",
        {
          href: `/product/${product.slug}`,
          onClick: handleClick,
          className: "block",
          children: /* @__PURE__ */ jsx("p", { className: "font-medium text-foreground text-sm line-clamp-1 hover:underline", children: product.name })
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "text-primary font-semibold text-sm", children: formatPrice(product.price) })
    ] }),
    product.variantId && /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: onAddToCart,
        disabled: addingToCart,
        className: "self-center shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50",
        "aria-label": `Add ${product.name} to cart`,
        children: [
          addingToCart ? /* @__PURE__ */ jsx(Loader2, { className: "h-3 w-3 animate-spin" }) : /* @__PURE__ */ jsx(ShoppingCart, { className: "h-3 w-3" }),
          /* @__PURE__ */ jsx("span", { className: "sr-only sm:not-sr-only", children: "Add" })
        ]
      }
    )
  ] });
}

// src/components/CollectionBadge.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function CollectionBadge({ collection, onNavigate, className }) {
  const handleClick = (e) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(`/collection/${collection.slug}`);
    }
  };
  return /* @__PURE__ */ jsx2(
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
import { ShoppingCart as ShoppingCart2 } from "lucide-react";
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function CartSummary({ order, formatPrice, className }) {
  return /* @__PURE__ */ jsxs2("div", { className: cn("mt-3 rounded-md border bg-background p-3 space-y-2", className), children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between text-xs font-medium text-muted-foreground", children: [
      /* @__PURE__ */ jsxs2("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx3(ShoppingCart2, { className: "h-3 w-3" }),
        "Your Cart (",
        order.totalQuantity,
        " item",
        order.totalQuantity !== 1 ? "s" : "",
        ")"
      ] }),
      /* @__PURE__ */ jsx3("span", { className: "font-semibold text-foreground", children: formatPrice(order.totalWithTax) })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "space-y-1.5", children: order.lines.map((line) => /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between text-sm", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsxs2("span", { className: "shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium", children: [
          line.quantity,
          "x"
        ] }),
        /* @__PURE__ */ jsx3("span", { className: "truncate", children: line.productName })
      ] }),
      /* @__PURE__ */ jsx3("span", { className: "shrink-0 text-xs text-muted-foreground ml-2", children: formatPrice(line.linePriceWithTax) })
    ] }, line.orderLineId)) })
  ] });
}

// src/components/ChatMessage.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsx4("div", { className: cn("flex", isUser ? "justify-end" : "justify-start"), children: /* @__PURE__ */ jsxs3(
    "div",
    {
      className: cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      ),
      children: [
        message.role === "assistant" && text ? /* @__PURE__ */ jsx4("div", { className: "chat-markdown max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_img]:hidden [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs", children: /* @__PURE__ */ jsx4(ReactMarkdown, { children: text }) }) : message.role === "user" ? /* @__PURE__ */ jsx4("p", { className: "whitespace-pre-wrap", children: text }) : null,
        data && data.collections.length > 0 && /* @__PURE__ */ jsx4("div", { className: "mt-2 flex flex-wrap gap-1.5", children: data.collections.map(
          (c) => renderCollection ? /* @__PURE__ */ jsx4(React.Fragment, { children: renderCollection(c) }, c.id) : /* @__PURE__ */ jsx4(CollectionBadge, { collection: c, onNavigate }, c.id)
        ) }),
        (data == null ? void 0 : data.activeOrder) && data.activeOrder.lines.length > 0 && (renderCartSummary ? renderCartSummary(data.activeOrder) : /* @__PURE__ */ jsx4(CartSummary, { order: data.activeOrder, formatPrice })),
        data && data.products.length > 0 && /* @__PURE__ */ jsx4("div", { className: "mt-3 space-y-2", children: data.products.map(
          (p) => renderProduct ? /* @__PURE__ */ jsx4(React.Fragment, { children: renderProduct(p) }, p.id) : /* @__PURE__ */ jsx4(
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
import { Fragment, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
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
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [addingToCart, setAddingToCart] = useState(null);
  const scrollRef = useRef(null);
  const processedActionsRef = useRef(/* @__PURE__ */ new Set());
  const { messages, sendMessage, status, isLoading } = useVendureChat({
    vendureUrl,
    authToken,
    chatEndpoint
  });
  useEffect(() => {
    var _a;
    (_a = scrollRef.current) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => {
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
    return /* @__PURE__ */ jsx5("div", { className: cn("flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background", className), children: renderPanel() });
  }
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: cn(
        "fixed z-[9999]",
        position === "bottom-right" ? "bottom-6 right-6" : "bottom-6 left-6",
        className
      ),
      children: [
        isOpen && /* @__PURE__ */ jsxs4(Fragment, { children: [
          /* @__PURE__ */ jsx5("div", { className: "fixed inset-0 z-[-1]", onClick: () => setIsOpen(false) }),
          /* @__PURE__ */ jsx5(
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
        /* @__PURE__ */ jsx5(
          "button",
          {
            onClick: () => setIsOpen(!isOpen),
            className: "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90",
            "aria-label": isOpen ? "Close chat" : "Open chat",
            children: isOpen ? /* @__PURE__ */ jsx5(X, { className: "h-6 w-6" }) : /* @__PURE__ */ jsx5(MessageCircle, { className: "h-6 w-6" })
          }
        )
      ]
    }
  );
  function renderPanel() {
    return /* @__PURE__ */ jsxs4(Fragment, { children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex shrink-0 items-center justify-between border-b p-4", children: [
        /* @__PURE__ */ jsxs4("h2", { className: "flex items-center gap-2 text-left font-semibold", children: [
          /* @__PURE__ */ jsx5(Store, { className: "h-5 w-5 text-primary" }),
          title
        ] }),
        !isInline && /* @__PURE__ */ jsx5(
          "button",
          {
            onClick: () => setIsOpen(false),
            className: "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            "aria-label": "Close",
            children: /* @__PURE__ */ jsx5(X, { className: "h-4 w-4" })
          }
        )
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "min-h-0 flex-1 overflow-y-auto p-4", children: /* @__PURE__ */ jsxs4("div", { className: "space-y-4", children: [
        messages.length === 0 && /* @__PURE__ */ jsxs4("div", { className: "space-y-4 py-4", children: [
          /* @__PURE__ */ jsx5("div", { className: "flex justify-start", children: /* @__PURE__ */ jsx5("div", { className: "max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm", children: /* @__PURE__ */ jsx5("p", { children: welcomeMessage }) }) }),
          /* @__PURE__ */ jsx5("div", { className: "flex flex-wrap gap-2", children: quickActions.map((action) => /* @__PURE__ */ jsxs4(
            "button",
            {
              onClick: () => handleSend(action),
              disabled: isLoading,
              className: "inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50",
              children: [
                /* @__PURE__ */ jsx5(Sparkles, { className: "h-3 w-3 text-primary" }),
                action
              ]
            },
            action
          )) })
        ] }),
        messages.map((msg) => /* @__PURE__ */ jsx5(
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
        isLoading && /* @__PURE__ */ jsx5("div", { className: "flex justify-start", children: /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2 rounded-lg bg-muted px-3 py-2", children: [
          /* @__PURE__ */ jsx5(Loader22, { className: "h-4 w-4 animate-spin text-muted-foreground" }),
          /* @__PURE__ */ jsx5("span", { className: "text-xs text-muted-foreground", children: status === "streaming" ? "Responding..." : "Thinking..." })
        ] }) }),
        /* @__PURE__ */ jsx5("div", { ref: scrollRef })
      ] }) }),
      /* @__PURE__ */ jsxs4("form", { onSubmit: handleSubmit, className: "flex shrink-0 gap-2 border-t p-4", children: [
        /* @__PURE__ */ jsx5(
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
        /* @__PURE__ */ jsx5(
          "button",
          {
            type: "submit",
            disabled: isLoading || !inputValue.trim(),
            className: "inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50",
            "aria-label": "Send message",
            children: isLoading ? /* @__PURE__ */ jsx5(Loader22, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsx5(Send, { className: "h-4 w-4" })
          }
        )
      ] })
    ] });
  }
}
function defaultFormatPrice(price) {
  return `$${(price / 100).toFixed(2)}`;
}
export {
  CartSummary,
  ChatMessage,
  CollectionBadge,
  ProductCard,
  VendureAiChat,
  cn,
  extractDataFromMessage,
  getMessageText,
  useVendureChat
};
//# sourceMappingURL=index.mjs.map