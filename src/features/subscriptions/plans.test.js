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
      currentPeriodEnd: "2099-01-01T00:00:00Z",
      features: { ownedActiveLeagues: 2, activePlayersPerLeague: 32 },
    });
  });
});
