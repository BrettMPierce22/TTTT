import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_SUMMARY,
  PLAN_CATALOG,
  getPlan,
  normalizePlanSummary,
} from "./plans";

describe("subscription plan catalog", () => {
  it("uses the approved monthly prices and product identifiers", () => {
    expect(PLAN_CATALOG.map(({ id, price }) => ({ id, price }))).toEqual([
      { id: "free", price: "$0" },
      { id: "plus", price: "$1.99" },
      { id: "pro", price: "$4.99" },
    ]);
    expect(getPlan("plus").productId).toBe(
      "com.tabletalktabletennis.app.leagueplus.monthly"
    );
    expect(getPlan("pro").productId).toBe(
      "com.tabletalktabletennis.app.leaguepro.monthly"
    );
  });

  it("keeps paid limits strictly above the tier below", () => {
    const [free, plus, pro] = PLAN_CATALOG;
    for (const limit of [
      "ownedActiveLeagues",
      "activePlayersPerLeague",
      "activeTournaments",
      "tournamentEntrants",
    ]) {
      expect(plus.limits[limit]).toBeGreaterThan(free.limits[limit]);
      expect(pro.limits[limit]).toBeGreaterThan(plus.limits[limit]);
    }
  });

  it("fails closed to Free for missing or unknown server data", () => {
    expect(normalizePlanSummary(null)).toEqual(DEFAULT_PLAN_SUMMARY);
    expect(normalizePlanSummary({ plan: "made_up" }).plan).toBe("free");
  });

  it("normalizes the allowlisted server response", () => {
    expect(
      normalizePlanSummary({
        plan: "plus",
        subscription_status: "active",
        current_period_end: "2099-01-01T00:00:00Z",
        features: { ownedActiveLeagues: 2 },
      })
    ).toMatchObject({
      plan: "plus",
      subscriptionStatus: "active",
      currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      features: { ownedActiveLeagues: 2, activePlayersPerLeague: 32 },
    });
  });
  it("does not accept arbitrary feature overrides or private provider metadata", () => {
    const summary = normalizePlanSummary({ plan: "free", subscription_status: "not_subscribed",
      features: { exports: true, ownedActiveLeagues: 999, secret: "private" }, provider_customer_id: "private" });
    expect(summary.features).toMatchObject({ exports: false, ownedActiveLeagues: 1, analytics: "basic" });
    expect(summary.features).not.toHaveProperty("secret");
    expect(summary).not.toHaveProperty("provider_customer_id");
    expect(normalizePlanSummary({ plan: "plus", subscription_status: "active", features: { exports: true } }).features.exports).toBe(false);
  });
  it.each(["expired", "revoked", "unknown", undefined])("does not display paid access for %s status", (status) => {
    expect(normalizePlanSummary({ plan: "pro", subscription_status: status }).plan).toBe("free");
  });
  it("handles invalid dates and preserves a server-approved grace period", () => {
    const summary = normalizePlanSummary({ plan: "pro", subscription_status: "grace_period", current_period_end: "bad" });
    expect(summary).toMatchObject({ plan: "pro", currentPeriodEnd: null });
    expect(normalizePlanSummary({ plan: "pro", subscriptionStatus: "active" }).features.exports).toBe(true);
  });
  it("prevents one screen from mutating the shared plan catalog", () => {
    expect(Object.isFrozen(getPlan("pro").limits)).toBe(true);
    expect(Object.isFrozen(getPlan("pro").features)).toBe(true);
    expect(Object.isFrozen(getPlan("pro"))).toBe(true);
  });
});
