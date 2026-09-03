import { createId } from "../tournaments/brackets";

// Reuse a primary key when a save response is lost. This protects retries in
// this app session; cross-device submissions and app restarts need server-side
// idempotency plus a persisted draft. Never automatically retry a write.
export function createMatchWriter(client, newId = createId) {
  const pending = new Map();
  let busy = false;
  async function save(payload) {
    if (busy) throw new Error("A match is already being saved.");
    busy = true;
    const scope = `${payload.created_by}:${payload.league_id}`;
    const fingerprint = JSON.stringify(payload);
    let attempt = pending.get(scope);
    try {
      if (attempt && attempt.fingerprint !== fingerprint) throw new Error("The previous save is unconfirmed. Retry with the same players and scores before recording another match.");
      const confirm = async () => {
        const { data, error } = await client.from("matches").select("id,league_id,player_a_id,player_b_id,format,games,created_by").eq("id", attempt.id).maybeSingle();
        if (error) throw error;
        if (!data) return false;
        const sameGames = Array.isArray(data.games) && data.games.length === payload.games.length && data.games.every((game, index) => game.a === payload.games[index].a && game.b === payload.games[index].b);
        if (!sameGames || Object.keys(payload).some((key) => key !== "games" && data[key] !== payload[key])) throw new Error("The saved match differs from this draft. Check match history before continuing.");
        return true;
      };
      if (attempt && await confirm()) { pending.delete(scope); return attempt.id; }
      if (!attempt) { attempt = { id: newId(), fingerprint }; pending.set(scope, attempt); }
      const { error } = await client.from("matches").insert({ id: attempt.id, ...payload });
      if (error) {
        if (error.code === "23505" && await confirm()) { pending.delete(scope); return attempt.id; }
        // A database-rejected transaction did not commit; allow correcting it.
        if (error.code !== "23505" && /^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(error.code || "")) pending.delete(scope);
        throw error;
      }
      pending.delete(scope);
      return attempt.id;
    } finally { busy = false; }
  }
  return { save };
}
