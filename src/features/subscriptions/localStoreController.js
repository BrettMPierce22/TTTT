export const LOCAL_PRODUCT_IDS = Object.freeze({
  plus: "com.tabletalktabletennis.local.leagueplus.monthly",
  pro: "com.tabletalktabletennis.local.leaguepro.monthly",
});

// This state is deliberately separate from get_my_plan(), auth, localStorage,
// and all production feature gates. A test purchase cannot grant real access.
export function createLocalStoreController(adapter) {
  let state = {
    started: false, busy: false, action: null, plan: "free",
    products: [], currentPeriodEnd: null, message: "", error: "",
  };
  const listeners = new Set();
  let refreshQueued = false;
  const publish = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  async function run(action, plan) {
    if (action === "status" && state.busy) { refreshQueued = true; return; }
    if (state.busy || (action !== "start" && !state.started)) return;
    if (action === "purchase" && !state.products.some((item) => item.plan === plan)) return;
    publish({ busy: true, action, error: "", message: "" });
    try {
      const result = await adapter[action](action === "purchase" ? { plan } : undefined);
      if (result?.environment !== "xcode-local" ||
          !["free", "plus", "pro"].includes(result.plan)) {
        // Never accept a real, unknown, or unverified store response here.
        publish({ started: false, plan: "free", products: [], currentPeriodEnd: null });
        throw new Error("Only verified local Apple test-store results are accepted.");
      }
      const products = action === "start"
        ? ["plus", "pro"].flatMap((id) => {
          const product = result.products?.find((item) =>
            item.plan === id && item.productId === LOCAL_PRODUCT_IDS[id] &&
            typeof item.displayPrice === "string" && item.displayPrice.trim()
          );
          return product ? [{ plan: id, productId: product.productId, displayPrice: product.displayPrice }] : [];
        })
        : state.products;
      if (action === "start" && products.length !== 2) {
        throw new Error("Both local test products must load before testing purchases.");
      }
      if (action === "purchase" && !["purchased", "pending", "cancelled"].includes(result.outcome)) {
        throw new Error("The test purchase did not return a recognized result. Refresh its status.");
      }
      const messages = {
        purchased: "Test purchase completed. No money was charged.",
        cancelled: "Test purchase cancelled. No change was requested.",
        pending: "Awaiting test purchase approval. Paid access is not assumed.",
        restored: result.plan === "free" ? "No active test subscription to restore." : "Test subscription restored.",
        expired: "Test expiration requested. Refresh to check the current state.",
      };
      publish({
        started: true, plan: result.plan, products,
        currentPeriodEnd: result.currentPeriodEnd || null,
        message: messages[result.outcome] || (action === "start" ? "Local Apple test store is ready." : "Test status refreshed."),
      });
    } catch (error) {
      publish({ error: error?.message || "The test store is unavailable. Try again." });
    } finally {
      publish({ busy: false, action: null });
      if (refreshQueued) {
        refreshQueued = false;
        if (state.started) await run("status");
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start: () => run("start"),
    refresh: () => run("status"),
    purchase: (plan) => run("purchase", plan),
    restore: () => run("restore"),
    expire: () => run("expire"),
  };
}
