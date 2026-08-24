import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function listStoragePaths(
  client: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        paths.push(itemPath);
      } else {
        paths.push(...(await listStoragePaths(client, bucket, itemPath)));
      }
    }

    if (data.length < 100) break;
    offset += data.length;
  }

  return paths;
}

async function removeUserStorage(
  client: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
) {
  const paths = await listStoragePaths(client, bucket, userId);

  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await client.storage
      .from(bucket)
      .remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Delete-account function is missing Supabase secrets.");
    return jsonResponse({ message: "Account deletion is not configured." }, 500);
  }

  if (!authorization) {
    return jsonResponse({ message: "Sign in before deleting your account." }, 401);
  }

  let requestBody: { confirmation?: string } = {};
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ message: "Invalid request." }, 400);
  }

  if (requestBody.confirmation !== "DELETE") {
    return jsonResponse({ message: "Deletion confirmation is required." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ message: "Your session is no longer valid." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = userData.user.id;

  const { data: ownedLeagues, error: leagueError } = await adminClient
    .from("leagues")
    .select("id,name")
    .eq("owner_user_id", userId);

  if (leagueError) {
    console.error("Could not check league ownership", leagueError);
    return jsonResponse({ message: "Account ownership could not be checked." }, 500);
  }

  if (ownedLeagues?.length) {
    return jsonResponse(
      {
        code: "owned_leagues",
        message: "Transfer or delete owned leagues before deleting your account.",
        leagues: ownedLeagues,
      },
      409,
    );
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(
    userId,
    false,
  );

  if (deleteError) {
    console.error("Could not delete Auth user", deleteError);
    return jsonResponse(
      {
        message:
          "Your account could not be deleted automatically. Please contact support.",
      },
      500,
    );
  }

  const cleanupResults = await Promise.allSettled([
    removeUserStorage(adminClient, "player-avatars", userId),
    removeUserStorage(adminClient, "table-location-photos", userId),
  ]);
  const cleanupPending = cleanupResults.some(
    (result) => result.status === "rejected",
  );

  if (cleanupPending) {
    console.error("Account deleted, but one or more storage cleanups failed.");
  }

  return jsonResponse({ deleted: true, cleanupPending });
});
