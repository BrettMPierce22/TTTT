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

export const DEFAULT_PLAN_SUMMARY = Object.freeze({
  plan: PLAN_IDS.FREE,
  subscriptionStatus: "not_subscribed",
  currentPeriodEnd: null,
  features: PLAN_CATALOG[0].limits,
});

export function getPlan(planId) {
  return (
    PLAN_CATALOG.find((plan) => plan.id === planId) || PLAN_CATALOG[0]
  );
}

export function normalizePlanSummary(summary) {
  const plan = getPlan(summary?.plan);

  return {
    plan: plan.id,
    subscriptionStatus:
      typeof summary?.subscription_status === "string"
        ? summary.subscription_status
        : typeof summary?.subscriptionStatus === "string"
          ? summary.subscriptionStatus
          : DEFAULT_PLAN_SUMMARY.subscriptionStatus,
    currentPeriodEnd:
      summary?.current_period_end || summary?.currentPeriodEnd || null,
    features: {
      ...plan.limits,
      ...(summary?.features || {}),
    },
  };
}
