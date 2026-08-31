// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createDeleteAccountHandler } from "./handler.js";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const env = { url: "https://test.invalid", anonKey: "public-test-key", serviceRoleKey: "server-test-key" };
const asset = (n, bucket = "player-avatars") => ({
  object_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  bucket_id: bucket, object_name: `${USER}/photo-${n}.jpg`,
});

function fixture(initialAssets = []) {
  const events = [];
  let remaining = [...initialAssets];
  const getUser = vi.fn(async () => ({ data: { user: { id: USER } }, error: null }));
  const deleteUser = vi.fn(async (id, soft) => {
    events.push(["deleteUser", id, soft]);
    return { error: null };
  });
  const rpc = vi.fn(async (name, args) => {
    events.push([name, args]);
    if (name === "get_account_deletion_assets") return {
      data: remaining.filter((a) => !args.p_after_id || a.object_id > args.p_after_id)
        .sort((a, b) => a.object_id.localeCompare(b.object_id)).slice(0, args.p_limit), error: null,
    };
    if (name === "begin_account_deletion") return { data: { started: true }, error: null };
    if (name === "prepare_account_deletion_asset_batch") return {
      data: remaining.filter((a) => a.bucket_id === args.p_bucket_id && args.p_object_ids.includes(a.object_id)),
      error: null,
    };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const remove = vi.fn(async (bucket, paths) => {
    events.push(["remove", bucket, paths]);
    remaining = remaining.filter((a) => !(a.bucket_id === bucket && paths.includes(a.object_name)));
    return { error: null };
  });
  const admin = { rpc, auth: { admin: { deleteUser } }, storage: { from: (bucket) => ({ remove: (paths) => remove(bucket, paths) }) } };
  const createClient = vi.fn((_url, key) => key === env.anonKey ? { auth: { getUser } } : admin);
  const logger = { error: vi.fn() };
  const handler = createDeleteAccountHandler({ createClient, env, logger });
  return { handler, createClient, logger, getUser, rpc, remove, deleteUser, events,
    addAsset: (value) => remaining.push(value), remaining: () => remaining };
}

function request(body = { confirmation: "DELETE" }, authorization = "Bearer test-session") {
  return new Request("https://test.invalid/delete-account", {
    method: "POST", headers: authorization ? { Authorization: authorization } : {}, body: JSON.stringify(body),
  });
}

describe("account deletion HTTP and authorization", () => {
  it.each([["OPTIONS", 200], ["GET", 405], ["PUT", 405]])("handles %s without contacting the backend", async (method, status) => {
    const f = fixture();
    expect((await f.handler(new Request("https://test.invalid", { method }))).status).toBe(status);
    expect(f.createClient).not.toHaveBeenCalled();
  });
  it.each([null, "", "Basic credentials", "Bearer token extra"])("rejects missing/malformed authorization %s", async (authorization) => {
    const f = fixture();
    expect((await f.handler(request(undefined, authorization))).status).toBe(401);
    expect(f.createClient).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { confirmation: "delete" }])("requires explicit confirmation for %j", async (body) => {
    const f = fixture();
    expect((await f.handler(request(body))).status).toBe(400);
    expect(f.createClient).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON", async () => {
    const f = fixture();
    const r = new Request("https://test.invalid", { method: "POST", headers: { Authorization: "Bearer test" }, body: "{" });
    expect((await f.handler(r)).status).toBe(400);
    expect(f.createClient).not.toHaveBeenCalled();
  });
  it("fails safely when server configuration is missing", async () => {
    const f = fixture();
    const handler = createDeleteAccountHandler({ createClient: f.createClient, env: { ...env, serviceRoleKey: "" } });
    expect((await handler(request())).status).toBe(503);
    expect(f.createClient).not.toHaveBeenCalled();
  });
  it("verifies the session with Auth before constructing an administrator client", async () => {
    const f = fixture();
    f.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect((await f.handler(request())).status).toBe(401);
    expect(f.createClient).toHaveBeenCalledTimes(1);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("ignores target IDs and paths supplied by the caller", async () => {
    const f = fixture();
    const result = await f.handler(request({ confirmation: "DELETE", userId: OTHER, bucket: "private", paths: ["other/file"] }));
    expect(result.status).toBe(200);
    expect(f.deleteUser).toHaveBeenCalledWith(USER, false);
    expect(f.rpc.mock.calls.every(([, args]) => args.p_user_id === USER)).toBe(true);
    expect(f.createClient.mock.calls[1][2]).not.toHaveProperty("global");
  });
  it("contains provider exceptions without exposing tokens or private paths", async () => {
    const f = fixture();
    f.getUser.mockRejectedValue(new Error("secret-token /private/path"));
    const response = await f.handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/secret-token|private\/path/);
    expect(JSON.stringify(f.logger.error.mock.calls)).not.toContain("secret-token");
  });
});

describe("account deletion cleanup and retries", () => {
  it("cleans all three supported buckets before deleting Auth", async () => {
    const f = fixture([asset(1), asset(2, "table-location-photos"), asset(3, "league-assets")]);
    const response = await f.handler(request());
    expect(await response.json()).toEqual({ deleted: true, cleanupPending: false });
    expect(f.remove).toHaveBeenCalledTimes(3);
    expect(f.events.at(-1)).toEqual(["deleteUser", USER, false]);
    expect(f.remaining()).toEqual([]);
  });
  it("paginates inventory and removes in batches of at most 100", async () => {
    const f = fixture(Array.from({ length: 205 }, (_, n) => asset(n + 1)));
    expect((await f.handler(request())).status).toBe(200);
    expect(f.remove.mock.calls.map(([, paths]) => paths.length)).toEqual([100, 100, 5]);
    expect(f.rpc.mock.calls.filter(([name]) => name === "get_account_deletion_assets")).toHaveLength(3);
  });
  it("does not begin or delete anything if a later inventory page fails", async () => {
    const f = fixture(Array.from({ length: 205 }, (_, n) => asset(n + 1)));
    const normal = f.rpc.getMockImplementation();
    f.rpc.mockImplementation((name, args) => args.p_after_id ? { data: null, error: new Error("unavailable") } : normal(name, args));
    expect((await f.handler(request())).status).toBe(503);
    expect(f.rpc.mock.calls.some(([name]) => name === "begin_account_deletion")).toBe(false);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
  it.each([
    { ...asset(1), bucket_id: "unknown-future-bucket" },
    { ...asset(1), object_name: "../other/photo.jpg" },
    { ...asset(1), object_id: "not-an-id" },
  ])("fails closed for unsupported inventory %j", async (value) => {
    const f = fixture([value]);
    expect((await f.handler(request())).status).toBe(503);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
  it("blocks league owners before any image is detached", async () => {
    const f = fixture([asset(1)]);
    const normal = f.rpc.getMockImplementation();
    f.rpc.mockImplementation((name, args) => name === "begin_account_deletion"
      ? { data: { code: "owned_leagues", leagues: [{ id: OTHER, name: "Example league" }] }, error: null }
      : normal(name, args));
    const response = await f.handler(request());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("owned_leagues");
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
  it("does not remove unexpected paths returned by a changed cleanup batch", async () => {
    const f = fixture([asset(1)]);
    const normal = f.rpc.getMockImplementation();
    f.rpc.mockImplementation((name, args) => name === "prepare_account_deletion_asset_batch"
      ? { data: [{ ...asset(1), object_name: `${OTHER}/private.jpg` }], error: null } : normal(name, args));
    expect((await f.handler(request())).status).toBe(503);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
  it("keeps the account retryable after a partial Storage failure", async () => {
    const f = fixture([asset(1), asset(2, "table-location-photos")]);
    const normal = f.remove.getMockImplementation();
    let failOnce = true;
    f.remove.mockImplementation((bucket, paths) => {
      if (bucket === "table-location-photos" && failOnce) { failOnce = false; return { error: new Error("offline") }; }
      return normal(bucket, paths);
    });
    const failed = await f.handler(request());
    expect(failed.status).toBe(503);
    expect((await failed.json()).code).toBe("account_deletion_incomplete");
    expect(f.deleteUser).not.toHaveBeenCalled();
    expect(f.remaining()).toEqual([asset(2, "table-location-photos")]);
    expect((await f.handler(request())).status).toBe(200);
    expect(f.deleteUser).toHaveBeenCalledTimes(1);
  });
  it("does not report deletion success when Auth deletion fails", async () => {
    const f = fixture([asset(1)]);
    f.deleteUser.mockResolvedValueOnce({ error: new Error("database unavailable") });
    const response = await f.handler(request());
    expect(response.status).toBe(503);
    expect((await response.json()).deleted).not.toBe(true);
    expect((await f.handler(request())).status).toBe(200);
  });
  it("detects an upload that arrived between preflight and the deletion intent", async () => {
    const f = fixture([asset(1)]);
    const normal = f.rpc.getMockImplementation();
    let addOnce = true;
    f.rpc.mockImplementation((name, args) => {
      if (name === "begin_account_deletion" && addOnce) { addOnce = false; f.addAsset(asset(2)); }
      return normal(name, args);
    });
    expect((await f.handler(request())).status).toBe(503);
    expect(f.deleteUser).not.toHaveBeenCalled();
    expect((await f.handler(request())).status).toBe(200);
  });
  it("tolerates an asset already removed by an earlier attempt", async () => {
    const f = fixture([asset(1)]);
    const normal = f.rpc.getMockImplementation();
    f.rpc.mockImplementation(async (name, args) => {
      if (name === "prepare_account_deletion_asset_batch") await f.remove("player-avatars", [asset(1).object_name]);
      return normal(name, args);
    });
    expect((await f.handler(request())).status).toBe(200);
    expect(f.remove).toHaveBeenCalledTimes(1);
  });
});
