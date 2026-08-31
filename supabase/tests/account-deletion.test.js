// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDeleteAccountHandler } from "../functions/delete-account/handler.js";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LEAGUE = "33333333-3333-4333-8333-333333333333";
const PLAYER = "44444444-4444-4444-8444-444444444444";
const OBJECT = "55555555-5555-4555-8555-555555555555";
let db;
const file = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
async function rows(sql, values = []) { return (await db.query(sql, values)).rows; }
async function role(name, user = USER) {
  await db.exec(`set local role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)", [user, name]);
}
async function service() { await role("service_role"); }
async function begin() { return rows("select public.begin_account_deletion($1) as result", [USER]); }
async function object({ id = OBJECT, bucket = "player-avatars", name = `${USER}/profile.jpg`, owner = USER, legacy = null } = {}) {
  await db.query("insert into storage.objects(id,bucket_id,name,owner_id,owner) values ($1,$2,$3,$4,$5)", [id,bucket,name,owner,legacy]);
}
async function expectDbError(sql, pattern, values = []) {
  await db.exec("savepoint expected_error");
  await expect(db.query(sql, values)).rejects.toThrow(pattern);
  await db.exec("rollback to savepoint expected_error; release savepoint expected_error");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await file("./fixtures/account-deletion.sql"));
  await db.exec(await file("../migrations/202608240005_account_deletion.sql"));
  const preflight = await db.exec(await file("../checks/account-deletion-readiness.sql"));
  expect(preflight[1].rows).toEqual([]);
  await db.exec(await file("../migrations/202608310001_safe_account_deletion.sql"));
}, 30000);
afterAll(async () => { if (db) await db.close(); });
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into auth.users values ($1), ($2)", [USER, OTHER]);
  await db.query("insert into public.leagues(id,name,owner_user_id) values ($1,'Shared league',$2)", [LEAGUE, OTHER]);
  await db.query("insert into public.players(id,user_id,name,avatar_url,profile_description) values ($1,$2,'Example player','old-avatar','private profile')", [PLAYER, USER]);
  await db.query("insert into public.account_profiles values ($1,'old-avatar')", [USER]);
});
afterEach(async () => { await db.exec("rollback"); });

describe("deletion inventory and permissions (local PostgreSQL)", () => {
  it("selects modern, legacy and unowned personal uploads without crossing ownership", async () => {
    await object();
    await object({ id: "55555555-5555-4555-8555-555555555556", bucket: "league-assets", name: `${LEAGUE}/logo.jpg` });
    await object({ id: "55555555-5555-4555-8555-555555555557", name: `${USER}/service-created.jpg`, owner: null });
    await object({ id: "55555555-5555-4555-8555-555555555558", name: `${USER}/foreign-owned.jpg`, owner: OTHER });
    await object({ id: "55555555-5555-4555-8555-555555555559", bucket: "league-assets", name: `${LEAGUE}/unowned.jpg`, owner: null });
    await object({ id: "55555555-5555-4555-8555-555555555560", name: `${USER}/legacy.jpg`, owner: null, legacy: USER });
    await service();
    const result = await rows("select * from public.get_account_deletion_assets($1)", [USER]);
    expect(result.map((r) => r.object_name)).toEqual([
      `${USER}/profile.jpg`, `${LEAGUE}/logo.jpg`, `${USER}/service-created.jpg`, `${USER}/legacy.jpg`,
    ]);
    expect((await rows("select public.tttt_owns_deletion_asset(null,null,'league-assets','unowned',$1) as owns", [USER]))[0].owns).toBe(false);
  });
  it("paginates by stable object IDs", async () => {
    await db.query("insert into storage.objects(bucket_id,name,owner_id) select 'player-avatars', $1 || '/' || n || '.jpg', $1 from generate_series(1,205) n", [USER]);
    await service();
    const first = await rows("select * from public.get_account_deletion_assets($1,null,200)", [USER]);
    const second = await rows("select * from public.get_account_deletion_assets($1,$2,200)", [USER,first.at(-1).object_id]);
    expect(first).toHaveLength(200);
    expect(second).toHaveLength(5);
    expect(new Set([...first,...second].map((r) => r.object_id)).size).toBe(205);
  });
  it.each(["anon", "authenticated"])("denies %s access to every server-only cleanup RPC", async (name) => {
    await role(name);
    for (const sql of [
      `select * from public.get_account_deletion_assets('${OTHER}')`,
      `select public.begin_account_deletion('${OTHER}')`,
      `select * from public.prepare_account_deletion_asset_batch('${OTHER}','player-avatars',array['${OBJECT}'::uuid])`,
      "select * from public.account_deletion_intents",
    ]) await expectDbError(sql, /permission denied/);
  });
  it("rejects wrong JWT role even if called using a privileged database connection", async () => {
    await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
    await expectDbError("select * from public.get_account_deletion_assets($1)", /Server access required/, [USER]);
  });
  it("rejects invalid page limits", async () => {
    await service();
    await expectDbError("select * from public.get_account_deletion_assets($1,null,201)", /Invalid page size/, [USER]);
  });
});

describe("deletion intent and upload protection", () => {
  it("refuses league-owner deletion without starting cleanup", async () => {
    await db.query("update public.leagues set owner_user_id=$1 where id=$2", [USER,LEAGUE]);
    await object(); await service();
    expect((await begin())[0].result.code).toBe("owned_leagues");
    expect(await rows("select * from public.account_deletion_intents")).toHaveLength(0);
    expect(await rows("select * from storage.objects")).toHaveLength(1);
  });
  it("is retryable and blocks uploads only for the deleting account", async () => {
    await service(); await begin(); await begin();
    expect(await rows("select * from public.account_deletion_intents")).toHaveLength(1);
    await role("authenticated");
    await expectDbError("insert into storage.objects(bucket_id,name,owner_id) values ('player-avatars','new.jpg',$1)", /row-level security/, [USER]);
    await role("authenticated", OTHER);
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('player-avatars','other.jpg',$1)", [OTHER]);
    expect(await rows("select * from storage.objects")).toHaveLength(1);
  });
  it("blocks replacements of existing uploads during deletion", async () => {
    await object(); await service(); await begin(); await role("authenticated");
    expect(await rows("update storage.objects set name='replaced.jpg' where id=$1 returning id", [OBJECT])).toHaveLength(0);
  });
  it("rejects uploads authenticated by a deleted account's still-unexpired token", async () => {
    await db.query("delete from auth.users where id=$1", [USER]);
    await role("authenticated");
    expect((await rows("select public.account_can_upload() as allowed"))[0].allowed).toBe(false);
    await expectDbError("insert into storage.objects(bucket_id,name,owner_id) values ('player-avatars','orphan.jpg',$1)", /row-level security/, [USER]);
  });
  it("prevents assigning a new league to an account already being deleted", async () => {
    await service(); await begin();
    await expectDbError("update public.leagues set owner_user_id=$1 where id=$2", /cannot take league ownership/, [USER,LEAGUE]);
  });
});

describe("reference cleanup and permanent deletion", () => {
  it("requires an intent before preparing any image for deletion", async () => {
    await object(); await service();
    await expectDbError("select * from public.prepare_account_deletion_asset_batch($1,'player-avatars',$2)", /not been started/, [USER,[OBJECT]]);
  });
  it("rejects a foreign object without touching image references", async () => {
    await object({ owner: OTHER }); await service(); await begin();
    await expectDbError("select * from public.prepare_account_deletion_asset_batch($1,'player-avatars',$2)", /ownership changed/, [USER,[OBJECT]]);
    expect((await rows("select avatar_url from public.account_profiles where user_id=$1", [USER]))[0].avatar_url).toBe("old-avatar");
  });
  it("removes an uploaded league logo reference without deleting the league or Storage metadata", async () => {
    const path = `${LEAGUE}/logo.jpg`;
    await object({ bucket: "league-assets", name: path });
    await db.query("update public.leagues set logo_path=$1,logo_url='old-logo',banner_path='someone-elses-banner' where id=$2", [path,LEAGUE]);
    await service(); await begin();
    const result = await rows("select * from public.prepare_account_deletion_asset_batch($1,'league-assets',$2)", [USER,[OBJECT]]);
    expect(result[0].object_name).toBe(path);
    expect(await rows("select owner_user_id,logo_path,logo_url,banner_path from public.leagues")).toEqual([
      { owner_user_id: OTHER, logo_path: null, logo_url: null, banner_path: "someone-elses-banner" },
    ]);
    expect(await rows("select * from storage.objects")).toHaveLength(1);
  });
  it("detaches contributed table photos but preserves someone else's listing", async () => {
    const path = `${USER}/${LEAGUE}/photo.jpg`;
    await object({ bucket: "table-location-photos", name: path });
    await db.query("insert into public.table_locations values ($1,$2,$3)", [LEAGUE,OTHER,path]);
    await db.query("insert into public.table_location_photo_submissions values ($1,$2,$3)", [OBJECT,USER,path]);
    await service(); await begin();
    await rows("select * from public.prepare_account_deletion_asset_batch($1,'table-location-photos',$2)", [USER,[OBJECT]]);
    expect(await rows("select submitted_by,photo_path from public.table_locations")).toEqual([{ submitted_by: OTHER, photo_path: null }]);
    expect(await rows("select * from public.table_location_photo_submissions")).toHaveLength(0);
  });
  it("refuses Auth deletion while any owned upload still exists", async () => {
    await object(); await service(); await begin();
    await expectDbError("delete from auth.users where id=$1", /Remove account uploads/, [USER]);
    expect((await rows("select name from public.players where id=$1", [PLAYER]))[0].name).toBe("Example player");
  });
  it("anonymizes history and deletes personal content after upload cleanup", async () => {
    await db.query("insert into public.league_messages values ($1,$2)", [OBJECT,PLAYER]);
    await db.query("insert into public.direct_messages values ($1,$2)", [OBJECT,PLAYER]);
    await db.query("insert into public.matches values ($1,$2)", [OBJECT,PLAYER]);
    await db.query("insert into public.table_location_reviews values ($1,$2)", [OBJECT,USER]);
    await service(); await begin();
    await db.query("delete from auth.users where id=$1", [USER]);
    expect(await rows("select name,user_id,avatar_url,is_active,profile_description from public.players")).toEqual([
      { name: "Deleted Player", user_id: null, avatar_url: null, is_active: false, profile_description: "" },
    ]);
    for (const table of ["account_profiles", "league_messages", "direct_messages", "table_location_reviews", "account_deletion_intents"])
      expect(await rows(`select * from public.${table}`)).toHaveLength(0);
    expect(await rows("select * from public.matches")).toHaveLength(1);
    expect(await rows("select * from public.leagues")).toHaveLength(1);
    expect(await rows("select * from auth.users")).toEqual([{ id: OTHER }]);
  });
});

describe("HTTP handler wired to real local SQL", () => {
  function localHandler(failTablePhotosOnce = false) {
    const calls = [];
    const admin = {
      rpc: async (name, args) => {
        try {
          if (name === "get_account_deletion_assets") return { data: await rows(
            "select * from public.get_account_deletion_assets($1,$2,$3)", [args.p_user_id,args.p_after_id,args.p_limit]), error: null };
          if (name === "begin_account_deletion") return { data: (await rows(
            "select public.begin_account_deletion($1) as result", [args.p_user_id]))[0].result, error: null };
          if (name === "prepare_account_deletion_asset_batch") return { data: await rows(
            "select * from public.prepare_account_deletion_asset_batch($1,$2,$3)", [args.p_user_id,args.p_bucket_id,args.p_object_ids]), error: null };
          throw new Error("Unknown test RPC");
        } catch (error) { return { data: null, error }; }
      },
      storage: { from: (bucket) => ({ remove: async (paths) => {
        calls.push(`storage:${bucket}`);
        if (bucket === "table-location-photos" && failTablePhotosOnce) {
          failTablePhotosOnce = false; return { error: new Error("Simulated Storage outage") };
        }
        // Test-only stand-in for the external Storage API. Production code must
        // never delete storage.objects rows directly.
        await db.query("delete from storage.objects where bucket_id=$1 and name=any($2)", [bucket,paths]);
        return { error: null };
      } }) },
      auth: { admin: { deleteUser: async (userId) => {
        calls.push("auth:delete"); await db.query("delete from auth.users where id=$1", [userId]);
        return { error: null };
      } } },
    };
    const handler = createDeleteAccountHandler({
      env: { url: "https://local-test.invalid", anonKey: "public-test", serviceRoleKey: "server-test" },
      createClient: (_url, key) => key === "public-test"
        ? { auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) } } : admin,
      logger: { error: () => {} },
    });
    return { calls, run: () => handler(new Request("https://local-test.invalid/delete-account", {
      method: "POST", headers: { Authorization: "Bearer fake-local-session" }, body: JSON.stringify({ confirmation: "DELETE" }),
    })) };
  }
  it("completes the coordinated file/reference/account cleanup without removing the shared league", async () => {
    await object();
    const logo = `${LEAGUE}/logo.jpg`;
    await object({ id: "55555555-5555-4555-8555-555555555556", bucket: "league-assets", name: logo });
    await db.query("update public.leagues set logo_path=$1,logo_url='uploaded-logo' where id=$2", [logo,LEAGUE]);
    await service();
    const local = localHandler();
    expect(await (await local.run()).json()).toEqual({ deleted: true, cleanupPending: false });
    expect(local.calls).toEqual(["storage:player-avatars", "storage:league-assets", "auth:delete"]);
    expect(await rows("select * from storage.objects")).toHaveLength(0);
    expect(await rows("select logo_path,owner_user_id from public.leagues")).toEqual([{ logo_path: null, owner_user_id: OTHER }]);
    expect(await rows("select * from auth.users")).toEqual([{ id: OTHER }]);
  });
  it("persists the deletion intent and resumes after a file-service failure", async () => {
    await object();
    await object({ id: "55555555-5555-4555-8555-555555555556", bucket: "table-location-photos" });
    await service();
    const local = localHandler(true);
    expect((await local.run()).status).toBe(503);
    expect(await rows("select * from auth.users where id=$1", [USER])).toHaveLength(1);
    expect(await rows("select * from public.account_deletion_intents")).toHaveLength(1);
    expect((await local.run()).status).toBe(200);
    expect(await rows("select * from public.account_deletion_intents")).toHaveLength(0);
    expect(local.calls.filter((event) => event === "auth:delete")).toHaveLength(1);
  });
});
