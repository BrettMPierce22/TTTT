import { describe, expect, it, vi } from "vitest";
import { createLocalStoreController, LOCAL_PRODUCT_IDS } from "./localStoreController";
const response = (patch = {}) => ({
  environment: "xcode-local", plan: "free", currentPeriodEnd: null,
  products: Object.entries(LOCAL_PRODUCT_IDS).map(([plan, productId]) => ({
    plan, productId, displayPrice: plan === "plus" ? "€1,99" : "€4,99",
  })),
  ...patch,
});
const setup = () => {
  const adapter = {
    start: vi.fn().mockResolvedValue(response()),
    status: vi.fn().mockResolvedValue(response()),
    purchase: vi.fn().mockResolvedValue(response({ plan: "plus", outcome: "purchased" })),
    restore: vi.fn().mockResolvedValue(response({ outcome: "restored" })),
    expire: vi.fn().mockResolvedValue(response({ outcome: "expired" })),
  };
  return { adapter, controller: createLocalStoreController(adapter) };
};

describe("local Apple purchase state", () => {
  it("does nothing before the user starts the test store", async () => {
    const { adapter, controller } = setup();
    await controller.purchase("plus"); await controller.restore(); await controller.refresh();
    expect(adapter.purchase).not.toHaveBeenCalled();
    expect(adapter.restore).not.toHaveBeenCalled();
    expect(adapter.status).not.toHaveBeenCalled();
  });
  it("loads localized test prices and upgrades from the returned entitlement", async () => {
    const { controller } = setup();
    await controller.start();
    expect(controller.getSnapshot().products[0].displayPrice).toBe("€1,99");
    await controller.purchase("plus");
    expect(controller.getSnapshot()).toMatchObject({ plan: "plus", busy: false, error: "" });
  });
  it.each(["pending", "cancelled"])("does not optimistically grant a %s purchase", async (outcome) => {
    const { adapter, controller } = setup();
    adapter.purchase.mockResolvedValue(response({ outcome }));
    await controller.start(); await controller.purchase("plus");
    expect(controller.getSnapshot().plan).toBe("free");
    expect(controller.getSnapshot().message).toBeTruthy();
  });
  it("keeps Pro until StoreKit reports a scheduled downgrade took effect", async () => {
    const { adapter, controller } = setup();
    adapter.start.mockResolvedValue(response({ plan: "pro" }));
    adapter.purchase.mockResolvedValue(response({ plan: "pro", outcome: "purchased" }));
    await controller.start(); await controller.purchase("plus");
    expect(controller.getSnapshot().plan).toBe("pro");
    adapter.status.mockResolvedValue(response({ plan: "plus" }));
    await controller.refresh();
    expect(controller.getSnapshot().plan).toBe("plus");
  });
  it("clears stale paid state on an empty restore or expiration", async () => {
    const { controller } = setup();
    await controller.start(); await controller.purchase("plus"); await controller.restore();
    expect(controller.getSnapshot().plan).toBe("free");
    await controller.purchase("plus"); await controller.expire();
    expect(controller.getSnapshot().plan).toBe("free");
  });
  it("blocks duplicate and overlapping purchases", async () => {
    const { adapter, controller } = setup();
    let finish;
    adapter.purchase.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await controller.start();
    const pending = controller.purchase("plus");
    await controller.purchase("pro"); await controller.restore();
    expect(adapter.purchase).toHaveBeenCalledTimes(1);
    expect(adapter.restore).not.toHaveBeenCalled();
    finish(response({ plan: "plus", outcome: "purchased" }));
    await pending;
    expect(controller.getSnapshot().busy).toBe(false);
  });
  it("rejects live environment responses and unknown product identifiers", async () => {
    const { adapter, controller } = setup();
    adapter.start.mockResolvedValue(response({ environment: "production", plan: "pro" }));
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({ started: false, plan: "free" });
    adapter.start.mockResolvedValue(response({ products: [{ plan: "plus", productId: "real-store-product", displayPrice: "$1.99" }] }));
    await controller.start();
    expect(controller.getSnapshot().started).toBe(false);
    await controller.purchase("plus");
    expect(adapter.purchase).not.toHaveBeenCalled();
  });
  it("refreshes an entitlement update that arrives during a purchase", async () => {
    const { adapter, controller } = setup();
    let finish;
    adapter.purchase.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    adapter.status.mockResolvedValue(response({ plan: "pro" }));
    await controller.start();
    const pending = controller.purchase("plus");
    await controller.refresh();
    await controller.refresh();
    expect(adapter.status).not.toHaveBeenCalled();
    finish(response({ plan: "plus", outcome: "purchased" }));
    await pending;
    expect(adapter.status).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ plan: "pro", busy: false });
  });
  it("recovers from failures without a stuck busy state", async () => {
    const { adapter, controller } = setup();
    adapter.start.mockRejectedValueOnce(new Error("No local configuration"));
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({ error: "No local configuration", busy: false });
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({ error: "", started: true });
  });
  it("notifies subscribers and stops notifying removed listeners", async () => {
    const { controller } = setup();
    const listener = vi.fn();
    const remove = controller.subscribe(listener);
    await controller.start();
    expect(listener).toHaveBeenCalled();
    remove(); listener.mockClear();
    await controller.refresh();
    expect(listener).not.toHaveBeenCalled();
  });
});
