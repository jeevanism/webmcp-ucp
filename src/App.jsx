import { useEffect, useMemo, useRef, useState } from "react";

const PRODUCTS = [
  {
    id: "p1",
    name: "Ceramic Mug",
    category: "home",
    pricePence: 899,
    description: "Dishwasher safe mug",
  },
  {
    id: "p2",
    name: "USB-C Cable 1m",
    category: "electronics",
    pricePence: 599,
    description: "USB-C to USB-C",
  },
  {
    id: "p3",
    name: "Notebook A5",
    category: "office",
    pricePence: 349,
    description: "Ruled paper notebook",
  },
  {
    id: "p4",
    name: "Desk Lamp",
    category: "office",
    pricePence: 1899,
    description: "LED lamp with dimmer",
  },
  {
    id: "p5",
    name: "Wireless Mouse",
    category: "electronics",
    pricePence: 1499,
    description: "2.4GHz mouse",
  },
  {
    id: "p6",
    name: "Coffee Grinder",
    category: "home",
    pricePence: 2999,
    description: "Burr grinder",
  },
];

const TOOL_NAMES = [
  "searchProducts",
  "addToCart",
  "createPaymentIntent",
  "checkout",
  "getOrderStatus",
];

const CURRENCY = "GBP";

function fmtGBP(pence) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: CURRENCY,
  }).format((Number(pence) || 0) / 100);
}

function moneyGBP(amountMinor) {
  return {
    currency: CURRENCY,
    amountMinor: Math.round(Number(amountMinor) || 0),
  };
}

function findProduct(productId) {
  return PRODUCTS.find((p) => p.id === productId);
}

function App() {
  const [mode, setMode] = useState("standard");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState(PRODUCTS);
  const [lastResultsOrder, setLastResultsOrder] = useState(PRODUCTS.map((p) => p.id));
  const [cart, setCart] = useState({});
  const [paymentIntents, setPaymentIntents] = useState({});
  const [orders, setOrders] = useState({});
  const [webmcp, setWebmcp] = useState({
    ok: false,
    text: "WebMCP: checking...",
    showEnableBlock: false,
    showHelp: false,
  });
  const [toolOutput, setToolOutput] = useState("(none)");
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState({});
  const [banner, setBanner] = useState(null);
  const [lookupOrderId, setLookupOrderId] = useState("");
  const [lookupOrderResult, setLookupOrderResult] = useState(null);

  const cartRef = useRef(cart);
  const paymentIntentsRef = useRef(paymentIntents);
  const ordersRef = useRef(orders);
  const lastResultsOrderRef = useRef(lastResultsOrder);
  const modeRef = useRef(mode);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    paymentIntentsRef.current = paymentIntents;
  }, [paymentIntents]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    lastResultsOrderRef.current = lastResultsOrder;
  }, [lastResultsOrder]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const withBusy = async (key, fn) => {
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      return await fn();
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  const logEvent = (event, payload) => {
    console.log(`[WebMCP demo] ${event}`, payload);
    setToolOutput(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
    setActivity((prev) => [{ event, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 8));
  };

  const searchProductsLogic = ({ q = "", category: cat = "" }) => {
    const qq = String(q).trim().toLowerCase();
    const cc = String(cat).trim().toLowerCase();
    const filtered = PRODUCTS.filter((p) => {
      const byText =
        !qq || p.name.toLowerCase().includes(qq) || p.description.toLowerCase().includes(qq);
      const byCat = !cc || p.category === cc;
      return byText && byCat;
    });

    setResults(filtered);
    setLastResultsOrder(filtered.map((p) => p.id));

    return {
      count: filtered.length,
      products: filtered.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: fmtGBP(p.pricePence),
        pricePence: p.pricePence,
        description: p.description,
      })),
    };
  };

  const getCartLogic = (cartObj = cartRef.current) => {
    let total = 0;
    const items = [];

    for (const [productId, quantity] of Object.entries(cartObj)) {
      const p = findProduct(productId);
      if (!p || quantity <= 0) continue;
      const lineTotal = p.pricePence * quantity;
      total += lineTotal;
      items.push({
        productId: p.id,
        name: p.name,
        quantity,
        unitPrice: fmtGBP(p.pricePence),
        lineTotal: fmtGBP(lineTotal),
        lineTotalPence: lineTotal,
      });
    }

    return {
      itemCount: items.reduce((acc, item) => acc + item.quantity, 0),
      total: fmtGBP(total),
      totalPence: total,
      items,
    };
  };

  const addToCartLogic = ({ productId, quantity = 1 }) => {
    const id = String(productId || "");
    const qty = Number(quantity);

    if (!id) throw new Error("productId is required");
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("quantity must be a positive number");

    const product = findProduct(id);
    if (!product) throw new Error(`Unknown productId: ${id}`);

    const current = cartRef.current;
    const next = { ...current, [id]: (current[id] || 0) + qty };
    setCart(next);
    cartRef.current = next;

    return getCartLogic(next);
  };

  const removeFromCartLogic = ({ productId }) => {
    const id = String(productId || "");
    if (!id) throw new Error("productId is required");
    const current = cartRef.current;
    const next = { ...current };
    delete next[id];
    setCart(next);
    cartRef.current = next;
    return getCartLogic(next);
  };

  const createPaymentIntentLogic = ({ amountMinor } = {}) => {
    const fromCart = getCartLogic().totalPence;
    const amount = amountMinor ?? fromCart;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("amountMinor must be > 0 (or cart must be non-empty)");
    }

    const id = `pi_${Math.random().toString(16).slice(2, 10)}`;
    const paymentIntent = {
      id,
      amount: moneyGBP(amount),
      status: "requires_confirmation",
      createdAt: new Date().toISOString(),
    };

    const next = { ...paymentIntentsRef.current, [id]: paymentIntent };
    setPaymentIntents(next);
    paymentIntentsRef.current = next;
    return paymentIntent;
  };

  const getOrderStatusLogic = ({ orderId }) => {
    const id = String(orderId || "");
    if (!id) throw new Error("orderId is required");
    const order = ordersRef.current[id];
    if (!order) throw new Error(`Unknown orderId: ${id}`);
    return order;
  };

  const checkoutStandardLogic = async ({ client } = {}) => {
    const cartSnapshot = getCartLogic();
    if (cartSnapshot.itemCount === 0) throw new Error("Cart is empty");

    const confirmMessage = `Confirm checkout for ${cartSnapshot.total}?`;
    let approved = false;

    if (client?.requestUserInteraction) {
      approved = await client.requestUserInteraction(async () => confirm(confirmMessage));
    } else {
      approved = confirm(confirmMessage);
    }

    if (!approved) return { ok: false, message: "User cancelled checkout" };

    const orderId = `ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    setCart({});
    cartRef.current = {};

    return {
      ok: true,
      orderId,
      message: "Checkout complete",
      charged: cartSnapshot.total,
      items: cartSnapshot.items,
    };
  };

  const checkoutUcpLogic = async ({ paymentIntentId, client } = {}) => {
    const cartSnapshot = getCartLogic();
    if (cartSnapshot.itemCount === 0) throw new Error("Cart is empty");

    let paymentIntent = null;
    if (paymentIntentId) {
      paymentIntent = paymentIntentsRef.current[String(paymentIntentId)];
      if (!paymentIntent) throw new Error(`Unknown paymentIntentId: ${paymentIntentId}`);
    } else {
      paymentIntent = createPaymentIntentLogic({ amountMinor: cartSnapshot.totalPence });
    }

    const confirmMessage = `Confirm checkout for ${fmtGBP(paymentIntent.amount.amountMinor)}?`;
    let approved = false;

    if (client?.requestUserInteraction) {
      approved = await client.requestUserInteraction(async () => confirm(confirmMessage));
    } else {
      approved = confirm(confirmMessage);
    }

    if (!approved) return { ok: false, message: "User cancelled checkout", paymentIntent };

    const updatedPi = { ...paymentIntent, status: "succeeded" };
    const nextPis = { ...paymentIntentsRef.current, [updatedPi.id]: updatedPi };
    setPaymentIntents(nextPis);
    paymentIntentsRef.current = nextPis;

    const orderId = `ord_${Math.random().toString(16).slice(2, 10)}`;
    const order = {
      id: orderId,
      status: "confirmed",
      createdAt: new Date().toISOString(),
      currency: CURRENCY,
      paymentIntentId: updatedPi.id,
      items: cartSnapshot.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: moneyGBP(findProduct(item.productId)?.pricePence || 0),
        lineTotal: moneyGBP(item.lineTotalPence),
        category: findProduct(item.productId)?.category || "unknown",
      })),
      totals: {
        subtotal: moneyGBP(updatedPi.amount.amountMinor),
        tax: moneyGBP(0),
        shipping: moneyGBP(0),
        total: moneyGBP(updatedPi.amount.amountMinor),
      },
    };

    const nextOrders = { ...ordersRef.current, [orderId]: order };
    setOrders(nextOrders);
    ordersRef.current = nextOrders;
    setCart({});
    cartRef.current = {};

    return { ok: true, order, paymentIntent: updatedPi };
  };

  useEffect(() => {
    const modelContext = navigator.modelContext;
    if (!modelContext) {
      setWebmcp((prev) => ({
        ...prev,
        ok: false,
        text: "WebMCP: not available",
        showEnableBlock: true,
      }));
      return undefined;
    }

    setWebmcp((prev) => ({
      ...prev,
      ok: true,
      text: "WebMCP: enabled (tools registered)",
      showEnableBlock: false,
    }));

    for (const toolName of TOOL_NAMES) {
      try {
        modelContext.unregisterTool(toolName);
      } catch {
        // no-op for first run
      }
    }

    modelContext.registerTool({
      name: "searchProducts",
      description:
        "Search products by text and optional category. Returns matching products with ids and prices.",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search text" },
          category: {
            type: "string",
            enum: ["office", "electronics", "home"],
            description: "Optional category filter",
          },
        },
      },
      execute: async (input) => {
        const result = searchProductsLogic(input || {});
        logEvent("tool:searchProducts", { input, result });
        return result;
      },
      annotations: { readOnlyHint: true },
    });

    modelContext.registerTool({
      name: "addToCart",
      description:
        "Add a product to the cart by productId and quantity. Returns the updated cart.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["productId"],
      },
      execute: async (input) => {
        const result = addToCartLogic(input || {});
        logEvent("tool:addToCart", { input, result });
        return result;
      },
    });

    if (mode === "ucp") {
      modelContext.registerTool({
        name: "createPaymentIntent",
        description:
          "Create a payment intent for current cart total (minor units). Returns PaymentIntent.",
        inputSchema: {
          type: "object",
          properties: {
            amountMinor: { type: "number" },
          },
        },
        execute: async (input) => {
          const result = createPaymentIntentLogic(input || {});
          logEvent("tool:createPaymentIntent", { input, result });
          return result;
        },
      });

      modelContext.registerTool({
        name: "checkout",
        description: "Checkout using a payment intent. Requires user confirmation.",
        inputSchema: {
          type: "object",
          properties: {
            paymentIntentId: { type: "string" },
          },
        },
        execute: async (input, client) => {
          const result = await checkoutUcpLogic({ ...(input || {}), client });
          logEvent("tool:checkout", { input, result });
          return result;
        },
      });

      modelContext.registerTool({
        name: "getOrderStatus",
        description: "Get order details by orderId.",
        inputSchema: {
          type: "object",
          properties: { orderId: { type: "string" } },
          required: ["orderId"],
        },
        execute: async (input) => {
          const result = getOrderStatusLogic(input || {});
          logEvent("tool:getOrderStatus", { input, result });
          return result;
        },
        annotations: { readOnlyHint: true },
      });
    } else {
      modelContext.registerTool({
        name: "checkout",
        description: "Checkout the current cart. Requires user confirmation.",
        inputSchema: { type: "object", properties: {} },
        execute: async (_input, client) => {
          const result = await checkoutStandardLogic({ client });
          logEvent("tool:checkout", { result });
          return result;
        },
      });
    }

    return () => {
      for (const toolName of TOOL_NAMES) {
        try {
          modelContext.unregisterTool(toolName);
        } catch {
          // no-op
        }
      }
    };
  }, [mode]);

  const cartView = useMemo(() => getCartLogic(cart), [cart]);

  const onSearch = async (event) => {
    event.preventDefault();
    await withBusy("search", async () => {
      const result = searchProductsLogic({ q: query, category });
      logEvent("ui:search", { input: { q: query, category }, result });
      setBanner({ type: "ok", message: `Found ${result.count} product(s).` });
    });
  };

  const onAdd = async (productId) => {
    await withBusy(`add-${productId}`, async () => {
      const result = addToCartLogic({ productId, quantity: 1 });
      logEvent("ui:addToCart", { input: { productId, quantity: 1 }, result });
      setBanner({ type: "ok", message: "Item added to cart." });
    });
  };

  const onRemove = (productId) => {
    const result = removeFromCartLogic({ productId });
    logEvent("ui:removeFromCart", { input: { productId }, result });
    setBanner({ type: "warn", message: "Item removed from cart." });
  };

  const onCheckout = async () => {
    await withBusy("checkout", async () => {
      const result =
        mode === "ucp" ? await checkoutUcpLogic() : await checkoutStandardLogic();

      logEvent("ui:checkout", result);
      if (!result.ok) {
        setBanner({ type: "warn", message: result.message });
        return;
      }

      if (mode === "ucp") {
        setBanner({
          type: "ok",
          message: `Order placed: ${result.order.id} (charged ${fmtGBP(result.order.totals.total.amountMinor)}).`,
        });
      } else {
        setBanner({
          type: "ok",
          message: `Order placed: ${result.orderId} (charged ${result.charged}).`,
        });
      }
    });
  };

  const onDemoSearch = async () => {
    await withBusy("demoSearch", async () => {
      const input = { q: "mug" };
      const result = searchProductsLogic(input);
      logEvent("demo:searchProducts", { input, result });
      setBanner({ type: "ok", message: "Demo search executed." });
    });
  };

  const onDemoAdd = async () => {
    await withBusy("demoAdd", async () => {
      const first = lastResultsOrderRef.current[0];
      if (!first) throw new Error("Search first (no results to add).");
      const input = { productId: first, quantity: 1 };
      const result = addToCartLogic(input);
      logEvent("demo:addToCart", { input, result });
      setBanner({ type: "ok", message: "Demo addToCart executed." });
    }).catch((error) => {
      setBanner({ type: "error", message: error.message || String(error) });
    });
  };

  const onDemoCheckout = async () => {
    await withBusy("demoCheckout", async () => {
      const result =
        modeRef.current === "ucp" ? await checkoutUcpLogic() : await checkoutStandardLogic();
      logEvent("demo:checkout", result);
      setBanner({
        type: result.ok ? "ok" : "warn",
        message: result.ok ? "Demo checkout complete." : result.message,
      });
    }).catch((error) => {
      setBanner({ type: "error", message: error.message || String(error) });
    });
  };

  const onCreatePaymentIntent = async () => {
    await withBusy("createPi", async () => {
      const result = createPaymentIntentLogic();
      logEvent("ui:createPaymentIntent", result);
      setBanner({
        type: "ok",
        message: `Payment intent created: ${result.id} (${fmtGBP(result.amount.amountMinor)}).`,
      });
    }).catch((error) => {
      setBanner({ type: "error", message: error.message || String(error) });
    });
  };

  const onLookupOrder = async () => {
    await withBusy("orderLookup", async () => {
      const result = getOrderStatusLogic({ orderId: lookupOrderId });
      setLookupOrderResult(result);
      logEvent("ui:getOrderStatus", result);
      setBanner({ type: "ok", message: `Loaded order: ${lookupOrderId}` });
    }).catch((error) => {
      setBanner({ type: "error", message: error.message || String(error) });
      setLookupOrderResult(null);
    });
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-primary-200 bg-white/85 p-6 shadow-sm backdrop-blur-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-primary-900">
              WebMCP Mini Shop
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-primary-900/75">
              React + Tailwind equivalent of the original demo. UI works for people, and when
              available the page exposes structured tools to AI agents.
            </p>
          </div>
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-2">
            <button
              type="button"
              onClick={() => setMode("standard")}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                mode === "standard"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-primary-800 hover:bg-primary-100"
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setMode("ucp")}
              className={`ml-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                mode === "ucp"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-primary-800 hover:bg-primary-100"
              }`}
            >
              UCP
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
              webmcp.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            {webmcp.text}
          </span>
          <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-800">
            Mode: {mode === "ucp" ? "UCP checkout flow" : "Standard checkout flow"}
          </span>
        </div>

        {webmcp.showEnableBlock && (
          <div className="mt-4 rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
            <h3 className="text-sm font-semibold text-primary-900">Enable WebMCP (experimental)</h3>
            <p className="mt-2 text-sm text-primary-900/80">
              WebMCP is available only in Chrome Dev/Canary with experimental flags enabled.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWebmcp((prev) => ({ ...prev, showHelp: !prev.showHelp }))}
                className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-50"
              >
                {webmcp.showHelp ? "Hide instructions" : "Show instructions"}
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText("chrome://flags")}
                className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-50"
              >
                Copy chrome://flags
              </button>
            </div>
            {webmcp.showHelp && (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-primary-900/80">
                <li>Install Chrome Dev or Canary.</li>
                <li>Open chrome://flags.</li>
                <li>Enable Experimental Web Platform Features.</li>
                <li>Restart browser and reload this page.</li>
              </ol>
            )}
          </div>
        )}

        {banner && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              banner.type === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : banner.type === "warn"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-rose-300 bg-rose-50 text-rose-800"
            }`}
          >
            {banner.message}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-3xl border border-primary-200 bg-white/90 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-primary-900">Shop</h2>
          <form onSubmit={onSearch} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-56 flex-1 flex-col text-xs font-medium text-primary-900/75">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. mug, cable, notebook"
                className="mt-1 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none ring-primary-300 focus:ring-2"
              />
            </label>
            <label className="flex min-w-40 flex-col text-xs font-medium text-primary-900/75">
              Category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-1 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none ring-primary-300 focus:ring-2"
              >
                <option value="">All</option>
                <option value="office">Office</option>
                <option value="electronics">Electronics</option>
                <option value="home">Home</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={Boolean(busy.search)}
              className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {busy.search ? "Searching..." : "Search"}
            </button>
          </form>

          <div className="mt-4 overflow-x-auto rounded-xl border border-primary-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-primary-50 text-primary-900/80">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-primary-900/60" colSpan={3}>
                      No results.
                    </td>
                  </tr>
                )}
                {results.map((product) => (
                  <tr key={product.id} className="border-t border-primary-100">
                    <td className="px-3 py-3">
                      <div className="font-medium text-primary-900">{product.name}</div>
                      <div className="text-xs text-primary-900/65">
                        {product.description} ·{" "}
                        <span className="rounded-full border border-primary-200 px-2 py-0.5">
                          {product.category}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-primary-900">{fmtGBP(product.pricePence)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={Boolean(busy[`add-${product.id}`])}
                        onClick={() => onAdd(product.id)}
                        className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-800 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy[`add-${product.id}`] ? "Adding..." : "Add"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="space-y-6">
          <article className="rounded-3xl border border-primary-200 bg-white/90 p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-primary-900">Cart</h2>
            {cartView.itemCount === 0 ? (
              <p className="mt-3 text-sm text-primary-900/65">Cart is empty.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="overflow-x-auto rounded-xl border border-primary-100">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-primary-50 text-primary-900/80">
                      <tr>
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cartView.items.map((item) => (
                        <tr key={item.productId} className="border-t border-primary-100">
                          <td className="px-3 py-2">
                            <div className="font-medium text-primary-900">{item.name}</div>
                            <div className="text-xs text-primary-900/65">{item.unitPrice} each</div>
                          </td>
                          <td className="px-3 py-2 text-primary-900">{item.quantity}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => onRemove(item.productId)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-primary-900">
                    Total: <strong>{cartView.total}</strong>
                  </p>
                  <button
                    type="button"
                    disabled={Boolean(busy.checkout)}
                    onClick={onCheckout}
                    className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-300"
                  >
                    {busy.checkout ? "Processing..." : "Checkout"}
                  </button>
                </div>
              </div>
            )}

            {mode === "ucp" && (
              <div className="mt-4 border-t border-primary-100 pt-4">
                <button
                  type="button"
                  disabled={Boolean(busy.createPi)}
                  onClick={onCreatePaymentIntent}
                  className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-100 disabled:opacity-60"
                >
                  {busy.createPi ? "Creating..." : "Create PaymentIntent"}
                </button>
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-primary-200 bg-white/90 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-primary-900">Agent Debug Helpers</h3>
            <p className="mt-2 text-xs leading-relaxed text-primary-900/70">
              These buttons run the same logic path used by WebMCP tools. Each action reports
              visible status so users can see what happened.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDemoSearch}
                disabled={Boolean(busy.demoSearch)}
                className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-100 disabled:opacity-60"
              >
                {busy.demoSearch ? "Running..." : 'Demo Search "mug"'}
              </button>
              <button
                type="button"
                onClick={onDemoAdd}
                disabled={Boolean(busy.demoAdd)}
                className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-100 disabled:opacity-60"
              >
                {busy.demoAdd ? "Running..." : "Demo Add First"}
              </button>
              <button
                type="button"
                onClick={onDemoCheckout}
                disabled={Boolean(busy.demoCheckout)}
                className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-100 disabled:opacity-60"
              >
                {busy.demoCheckout ? "Running..." : "Demo Checkout"}
              </button>
            </div>

            {mode === "ucp" && (
              <div className="mt-4 space-y-2 border-t border-primary-100 pt-4">
                <p className="text-xs font-medium text-primary-900/70">Order Status Lookup</p>
                <div className="flex gap-2">
                  <input
                    value={lookupOrderId}
                    onChange={(event) => setLookupOrderId(event.target.value)}
                    placeholder="ord_..."
                    className="w-full rounded-lg border border-primary-200 px-3 py-2 text-xs outline-none ring-primary-300 focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={onLookupOrder}
                    disabled={Boolean(busy.orderLookup)}
                    className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-100 disabled:opacity-60"
                  >
                    {busy.orderLookup ? "Loading..." : "Lookup"}
                  </button>
                </div>
                {lookupOrderResult && (
                  <pre className="overflow-auto rounded-xl border border-primary-100 bg-primary-50 p-3 text-[11px] text-primary-900">
                    {JSON.stringify(lookupOrderResult, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <h4 className="mt-4 text-sm font-semibold text-primary-900">Last Tool Result</h4>
            <pre className="mt-2 overflow-auto rounded-xl border border-primary-100 bg-primary-50 p-3 text-[11px] text-primary-900">
              {toolOutput}
            </pre>

            <h4 className="mt-4 text-sm font-semibold text-primary-900">Activity</h4>
            <ul className="mt-2 space-y-1 text-xs text-primary-900/75">
              {activity.length === 0 && <li>No actions yet.</li>}
              {activity.map((item, index) => (
                <li key={`${item.event}-${index}`} className="rounded-lg bg-primary-50 px-2 py-1">
                  <span className="font-medium">{item.time}</span> · {item.event}
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </section>
    </main>
  );
}

export default App;
