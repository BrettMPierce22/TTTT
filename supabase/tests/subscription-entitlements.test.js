// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
let db;
const file = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const rows = async (sql, values = []) => (await db.query(sql, values)).rows;

async function role(name, user = USER) {
  await db.exec(`set local role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
}

async function expectDbError(sql, pattern, values = []) {
  await db.exec("savepoint expected_error");
  await expect(db.query(sql, values)).rejects.toThrow(pattern);
  await db.exec("rollback to savepoint expected_error; release savepoint expected_error");
}

async function entitlement({
  user = USER,
  type = "league_pro",
  status = "active",
  end = "2099-01-01T00:00:00Z",
  grace = null,
} = {}) {
  const product = `com.tabletalktabletennis.app.${
    type === "league_plus" ? "leagueplus" : "leaguepro"
  }.monthly`;
  await db.query(
    `insert into public.account_entitlements(
      user_id,entitlement,status,provider,product_id,current_period_end,grace_period_end
    ) values ($1,$2,$3,'apple',$4,$5,$6)`,
    [user, type, status, product, end, grace]
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await file("./fixtures/subscription-entitlements.sql"));
  await db.exec(await file("../migrations/202609020001_subscription_entitlements.sql"));
}, 30000);

afterAll(async () => {
  if (db) await db.close();
});

beforeEach(async () => {
  await db.exec("begin");
  await db.query(
    "insert into auth.users(id,email) values ($1,'user@example.invalid'),($2,'other@example.invalid')",
    [USER, OTHER]
  );
});

afterEach(async () => {
  await db.exec("rollback");
});

describe("subscription entitlement authority", () => {
  it("defaults an account with no entitlement to the free plan", async () => {
    await role("authenticated");
    const [plan] = await rows("select * from public.get_my_plan()");
    expect(plan.plan).toBe("free");
    expect(plan.subscription_status).toBe("not_subscribed");
    expect(plan.features.ownedActiveLeagues).toBe(1);
  });

  it("returns League Plus only while a Plus entitlement is current", async () => {
    await entitlement({ type: "league_plus" });
    await role("authenticated");
    expect((await rows("select public.has_active_entitlement('league_plus') as active"))[0].active).toBe(true);
    expect((await rows("select public.has_active_entitlement('league_pro') as active"))[0].active).toBe(false);
    const [plan] = await rows("select * from public.get_my_plan()");
    expect(plan.plan).toBe("plus");
    expect(plan.features.activePlayersPerLeague).toBe(32);
    expect(plan.features.activeTournaments).toBe(2);
  });

  it("returns League Pro and lets Pro satisfy Plus checks", async () => {
    await entitlement();
    await role("authenticated");
    expect((await rows("select public.has_active_entitlement('league_pro') as active"))[0].active).toBe(true);
    expect((await rows("select public.has_active_entitlement('league_plus') as active"))[0].active).toBe(true);
    const [plan] = await rows("select * from public.get_my_plan()");
    expect(plan.plan).toBe("pro");
    expect(plan.features.activePlayersPerLeague).toBe(100);
    expect(plan.features.tournamentEntrants).toBe(128);
  });

  it("resolves a provider transition with two active rows to Pro", async () => {
    await entitlement({ type: "league_plus" });
    await entitlement({ type: "league_pro" });
    await role("authenticated");
    expect((await rows("select * from public.get_my_plan()"))[0].plan).toBe("pro");
  });

  it("falls back to free after an entitlement expires", async () => {
    await entitlement({ type: "league_plus", status: "expired", end: "2020-01-01T00:00:00Z" });
    await role("authenticated");
    const [plan] = await rows("select * from public.get_my_plan()");
    expect(plan.plan).toBe("free");
    expect(plan.subscription_status).toBe("expired");
  });

  it("honors a current billing grace period but not an expired one", async () => {
    await entitlement({ status: "grace_period", end: "2020-01-01T00:00:00Z", grace: "2099-01-01T00:00:00Z" });
    await role("authenticated");
    expect((await rows("select public.has_active_entitlement('league_pro') as active"))[0].active).toBe(true);

    await role("service_role");
    await db.query("update public.account_entitlements set grace_period_end='2020-01-01T00:00:00Z' where user_id=$1", [USER]);
    await role("authenticated");
    expect((await rows("select public.has_active_entitlement('league_pro') as active"))[0].active).toBe(false);
  });

  it("keeps another account's entitlement private", async () => {
    await entitlement({ user: OTHER });
    await role("authenticated", USER);
    await expectDbError(
      "select user_id from public.account_entitlements",
      /permission denied/
    );
    expect((await rows("select public.has_active_entitlement('league_pro') as active"))[0].active).toBe(false);
  });

  it("does not let clients grant or extend their own Pro access", async () => {
    await role("authenticated");
    await expectDbError(
      "insert into public.account_entitlements(user_id,entitlement,status,provider) values ($1,'league_plus','active','apple')",
      /permission denied/,
      [USER]
    );
    await expectDbError(
      "update public.account_entitlements set current_period_end='2099-01-01' where user_id=$1",
      /permission denied/,
      [USER]
    );
  });

  it("allows only the server role to maintain provider state and webhook idempotency", async () => {
    await role("service_role");
    await entitlement();
    await db.query(
      "insert into public.billing_webhook_events(provider,event_id,payload_sha256) values ('revenuecat','evt-1',$1)",
      ["a".repeat(64)]
    );
    expect(await rows("select provider,event_id from public.billing_webhook_events")).toEqual([
      { provider: "revenuecat", event_id: "evt-1" },
    ]);
  });
});
