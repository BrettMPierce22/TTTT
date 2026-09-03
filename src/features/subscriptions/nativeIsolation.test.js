// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { LOCAL_PRODUCT_IDS } from "./localStoreController";
import { PLAN_CATALOG } from "./plans";
const read = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");
describe("native local-store isolation", () => {
  it("keeps test products distinct from real billing and matches the agreed prices", async () => {
    const configuration = JSON.parse(await read("../ios/App/App/TableTalkPlans.storekit"));
    const subscriptions = configuration.subscriptionGroups[0].subscriptions;
    expect(subscriptions).toHaveLength(2);
    for (const plan of PLAN_CATALOG.filter((item) => item.productId)) {
      const test = subscriptions.find((item) => item.productID === LOCAL_PRODUCT_IDS[plan.id]);
      expect(test.productID).not.toBe(plan.productId);
      expect(test.displayPrice).toBe(plan.price.slice(1));
      expect(test.recurringSubscriptionPeriod).toBe("P1M");
    }
  });
  it("compiles and registers the local bridge only in Debug simulator builds", async () => {
    const plugin = await read("../ios/App/App/LocalSubscriptionStorePlugin.swift");
    const bridge = await read("../ios/App/App/TableTalkViewController.swift");
    expect(plugin).toContain("#if DEBUG && targetEnvironment(simulator)");
    expect(bridge).toMatch(/#if DEBUG && targetEnvironment\(simulator\)\s+bridge\?\.registerPluginInstance\(LocalSubscriptionStorePlugin\(\)\)\s+#endif/);
    expect(plugin).toContain("transaction.environment == .xcode");
    expect(plugin).toContain("app.environment == .xcode");
    for (const action of ["purchase", "restore", "expire"]) {
      expect(plugin).toContain("@objc func " + action + "(_ call: CAPPluginCall) {\n        run(call) {\n            try self.requireSession()\n            try await self.requireLocalEnvironment()");
    }
    expect(plugin).not.toContain("supabase");
    const project = await read("../ios/App/App.xcodeproj/project.pbxproj");
    expect(project).toMatch(/504EC3181FED79650016851F[^]*?EXCLUDED_SOURCE_FILE_NAMES = TableTalkPlans.storekit/);
  });
});
