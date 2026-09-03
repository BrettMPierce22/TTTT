import { useEffect, useState, useSyncExternalStore } from "react";
import { createLocalStoreController } from "./localStoreController";
import { getPlan } from "./plans";
import { LocalSubscriptionStore } from "../../native/localSubscriptionStore";

export default function LocalSubscriptionLab({ adapter = LocalSubscriptionStore }) {
  const [controller] = useState(() => createLocalStoreController(adapter));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    let disposed = false;
    let listener;
    const refresh = () => { void controller.refresh(); };
    if (adapter.addListener) {
      Promise.resolve(adapter.addListener("changed", refresh)).then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      }).catch(() => { /* Manual Refresh remains available. */ });
    }
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      void listener?.remove();
      window.removeEventListener("focus", refresh);
    };
  }, [adapter, controller]);

  return (
    <section className="subscription-plans-panel subscription-test-lab" aria-labelledby="test-store-title">
      <p className="season-label">SIMULATOR ONLY · NO REAL CHARGES</p>
      <h3 id="test-store-title">Apple purchase test lab</h3>
      <p>
        This uses Apple's local StoreKit test environment. It never updates your
        real plan, leagues, or Supabase. Production purchases remain disabled.
      </p>
      {!state.started ? (
        <button type="button" className="secondary-button" disabled={state.busy} onClick={controller.start}>
          {state.busy ? "Starting test store…" : "Start local Apple test store"}
        </button>
      ) : (
        <>
          <p><strong>Simulated plan: {getPlan(state.plan).name}</strong></p>
          <div className="subscription-test-actions">
            {state.products.map((product) => (
              <button type="button" className="secondary-button" key={product.plan}
                disabled={state.busy || state.plan === product.plan}
                onClick={() => controller.purchase(product.plan)}>
                Test {getPlan(product.plan).name} · {product.displayPrice}/month
              </button>
            ))}
            <button type="button" className="secondary-button" disabled={state.busy} onClick={controller.restore}>
              Restore test purchases
            </button>
            <button type="button" className="secondary-button" disabled={state.busy || state.plan === "free"} onClick={controller.expire}>
              Simulate expiration
            </button>
            <button type="button" className="secondary-button" disabled={state.busy} onClick={controller.refresh}>
              Refresh test status
            </button>
          </div>
          <p className="form-help">
            A downgrade can remain pending until the test billing period ends.
            Cancel from Apple's test payment sheet to test cancellation.
          </p>
        </>
      )}
      {state.busy && <p role="status">Waiting for the local Apple test store…</p>}
      {state.message && <p role="status">{state.message}</p>}
      {state.error && <p role="alert" className="error-message">{state.error}</p>}
    </section>
  );
}
