// Server only. Do not import this module into the web/iPhone bundle.
const BUCKETS = new Set(["player-avatars", "table-location-photos", "league-assets"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 200;
const MAX_ASSETS = 10000;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
  });
}

function validPath(path) {
  return typeof path === "string" && path.length > 0 &&
    !path.includes("\0") && !path.split("/").some((part) => !part || part === "." || part === "..");
}

function validateAsset(asset) {
  if (!asset || !UUID.test(asset.object_id) || !BUCKETS.has(asset.bucket_id) ||
      !validPath(asset.object_name)) {
    throw new Error("Unsupported or invalid account asset inventory.");
  }
}

async function listAssets(client, userId) {
  const assets = [];
  const ids = new Set();
  let after = null;
  while (true) {
    const { data, error } = await client.rpc("get_account_deletion_assets", {
      p_user_id: userId, p_after_id: after, p_limit: PAGE_SIZE,
    });
    if (error) throw error;
    if (!Array.isArray(data) || data.length > PAGE_SIZE) throw new Error("Invalid inventory page.");
    for (const asset of data) {
      validateAsset(asset);
      if (ids.has(asset.object_id) || (after && asset.object_id <= after)) {
        throw new Error("Invalid inventory cursor.");
      }
      ids.add(asset.object_id);
      assets.push(asset);
      if (assets.length > MAX_ASSETS) throw new Error("Account requires assisted asset cleanup.");
    }
    if (data.length < PAGE_SIZE) return assets;
    after = data.at(-1).object_id;
  }
}

async function removeAssets(client, userId, assets) {
  for (const bucket of BUCKETS) {
    const bucketAssets = assets.filter((asset) => asset.bucket_id === bucket);
    for (let offset = 0; offset < bucketAssets.length; offset += 100) {
      const batch = bucketAssets.slice(offset, offset + 100);
      // Recheck ownership on the server and detach image references before the
      // Storage API removes bytes. SQL must never delete Storage metadata.
      const { data, error } = await client.rpc("prepare_account_deletion_asset_batch", {
        p_user_id: userId, p_bucket_id: bucket,
        p_object_ids: batch.map((asset) => asset.object_id),
      });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid cleanup batch.");
      const expected = new Map(batch.map((asset) => [asset.object_id, asset.object_name]));
      const returnedIds = new Set();
      for (const asset of data) {
        validateAsset(asset);
        if (asset.bucket_id !== bucket || expected.get(asset.object_id) !== asset.object_name ||
            returnedIds.has(asset.object_id)) throw new Error("Asset changed during cleanup.");
        returnedIds.add(asset.object_id);
      }
      if (data.length) {
        const { error: removeError } = await client.storage.from(bucket)
          .remove(data.map((asset) => asset.object_name));
        if (removeError) throw removeError;
      }
    }
  }
}

export function createDeleteAccountHandler({ createClient, env, logger = console }) {
  return async function deleteAccount(request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);

    const authorization = request.headers.get("Authorization");
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      return json({ message: "Sign in before deleting your account." }, 401);
    }
    let body;
    try { body = await request.json(); } catch { return json({ message: "Invalid request." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || body.confirmation !== "DELETE") {
      return json({ message: "Deletion confirmation is required." }, 400);
    }
    if (!env.url || !env.anonKey || !env.serviceRoleKey) {
      return json({ message: "Account deletion is not configured." }, 503);
    }

    let started = false;
    let stage = "authentication";
    try {
      const userClient = createClient(env.url, env.anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !UUID.test(userData?.user?.id ?? "")) {
        return json({ message: "Your session is no longer valid." }, 401);
      }
      // Never accept a target user ID, bucket or path from the request body.
      const userId = userData.user.id;
      const admin = createClient(env.url, env.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      stage = "preflight";
      // Complete inventory validation before any file cleanup. A missing
      // migration or an unknown future bucket fails closed.
      const assets = await listAssets(admin, userId);
      const { data: begin, error: beginError } = await admin.rpc("begin_account_deletion", {
        p_user_id: userId,
      });
      if (beginError) throw beginError;
      if (begin?.code === "owned_leagues") {
        return json({
          code: "owned_leagues",
          message: "Transfer or delete owned leagues before deleting your account.",
          leagues: begin.leagues,
        }, 409);
      }
      if (begin?.started !== true) throw new Error("Deletion could not be started.");
      started = true;

      stage = "storage_cleanup";
      await removeAssets(admin, userId, assets);
      // Uploads that arrived between preflight and begin must not be skipped.
      // A retry lists them again; the deletion intent blocks further uploads.
      if ((await listAssets(admin, userId)).length) throw new Error("Uploads remain; retry cleanup.");

      stage = "auth_deletion";
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
      if (deleteError) throw deleteError;
      return json({ deleted: true, cleanupPending: false });
    } catch {
      // Do not return/log JWTs, API keys, private paths or provider error bodies.
      logger.error("Account deletion failed", { stage });
      if (stage === "authentication") {
        return json({ message: "Could not verify your session. Please try again." }, 503);
      }
      return json({
        code: started ? "account_deletion_incomplete" : "account_deletion_unavailable",
        retryable: true,
        message: started
          ? "We could not confirm that account deletion finished. Some uploaded images may already be removed. New uploads are paused while deletion is in progress. Please retry deletion or contact support."
          : "Account deletion is temporarily unavailable. No images were removed by this attempt. Please retry or contact support.",
      }, 503);
    }
  };
}
