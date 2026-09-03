export const PLAN_IDS = Object.freeze({
  FREE: "free",
  PLUS: "plus",
  PRO: "pro",
});

export const PLAN_CATALOG = Object.freeze([
  {
    id: PLAN_IDS.FREE,
    name: "Free",
    price: "$0",
    cadence: "forever",
    description: "Everything a player needs, plus a small league.",
    productId: null,
    limits: {
      ownedActiveLeagues: 1,
      activePlayersPerLeague: 16,
      activeTournaments: 1,
      tournamentEntrants: 16,
    },
    features: [
      "Join unlimited leagues",
      "Manage 1 active league",
      "Up to 16 players per league",
      "1 active 16-player tournament",
      "Matches, standings, chat, and table finder",
    ],
  },
  {
    id: PLAN_IDS.PLUS,
    name: "Plus",
    price: "$1.99",
    cadence: "per month",
    description: "For organizers growing a local league.",
    productId: "com.tabletalktabletennis.app.leagueplus.monthly",
    limits: {
      ownedActiveLeagues: 2,
      activePlayersPerLeague: 32,
      activeTournaments: 2,
      tournamentEntrants: 32,
    },
    features: [
      "Manage up to 2 active leagues",
      "Up to 32 players per league",
      "2 active 32-player tournaments",
      "Expanded organizer statistics",
      "Basic league branding",
    ],
  },
  {
    id: PLAN_IDS.PRO,
    name: "Pro",
    price: "$4.99",
    cadence: "per month",
    description: "For larger leagues and serious tournament directors.",
    productId: "com.tabletalktabletennis.app.leaguepro.monthly",
    limits: {
      ownedActiveLeagues: 5,
      activePlayersPerLeague: 100,
      activeTournaments: 10,
      tournamentEntrants: 128,
    },
    features: [
      "Manage up to 5 active leagues",
      "Up to 100 players per league",
      "10 active 128-player tournaments",
      "Advanced analytics and CSV exports",
      "Custom branding and added admin tools",
    ],
  },
]);

for (const plan of PLAN_CATALOG) {
  Object.freeze(plan.limits);
  Object.freeze(plan.features);
  Object.freeze(plan);
}

const CAPABILITIES = Object.freeze({
  free: Object.freeze({ analytics: "basic", exports: false, customBranding: false }),
  plus: Object.freeze({ analytics: "expanded", exports: false, customBranding: false }),
  pro: Object.freeze({ analytics: "advanced", exports: true, customBranding: true }),
});
const STATUSES = new Set(["not_subscribed", "trialing", "active", "grace_period", "expired", "revoked"]);

export const DEFAULT_PLAN_SUMMARY = Object.freeze({
  plan: PLAN_IDS.FREE,
  subscriptionStatus: "not_subscribed",
  currentPeriodEnd: null,
  features: Object.freeze({ ...PLAN_CATALOG[0].limits, ...CAPABILITIES.free }),
});

export function getPlan(planId) {
  return (
    PLAN_CATALOG.find((plan) => plan.id === planId) || PLAN_CATALOG[0]
  );
}

export function normalizePlanSummary(summary) {
  // Only display a recognized server decision. Client normalization is not an
  // entitlement authority; expiration/grace decisions belong to get_my_plan().
  const knownPlan = PLAN_CATALOG.find((item) => item.id === summary?.plan);
  const incomingStatus = summary?.subscription_status ?? summary?.subscriptionStatus;
  const subscriptionStatus = knownPlan && STATUSES.has(incomingStatus) ? incomingStatus : "not_subscribed";
  const plan = knownPlan && ["trialing", "active", "grace_period"].includes(subscriptionStatus)
    ? knownPlan : getPlan("free");
  const date = summary?.current_period_end ?? summary?.currentPeriodEnd;
  const currentPeriodEnd = knownPlan && typeof date === "string" && Number.isFinite(Date.parse(date))
    ? new Date(date).toISOString() : null;

  return {
    plan: plan.id,
    subscriptionStatus,
    currentPeriodEnd,
    features: { ...plan.limits, ...CAPABILITIES[plan.id] },
  };
}
