const PAGE_SIZE = 250;
const MAX_ROWS = 50000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = {
  players: "id,league_id,name,is_active,created_at",
  matches: "id,league_id,player_a_id,player_b_id,format,games,created_at",
};
const checkAbort = (signal) => {
  // Keep the iOS 15 deployment target supported; do not require newer
  // AbortSignal.throwIfAborted/timeout helpers in WKWebView.
  if (signal?.aborted) throw new DOMException("Report loading cancelled.", "AbortError");
};

// Read-only, session-authorized queries. Never use a service key or fetch account
// metadata. UUID keyset paging avoids offset shifts; a fixed upper date excludes
// newly recorded matches. This is not a transactionally frozen database snapshot.
export async function fetchOrganizerReportData(client, { leagueId, days, signal, onProgress, now = new Date() }) {
  if (!UUID.test(leagueId) || ![30, 90, null].includes(days) || !Number.isFinite(new Date(now).getTime())) {
    throw new Error("Choose a valid league and report period.");
  }
  const asOf = new Date(now).toISOString();
  const cutoff = days === null ? null : new Date(new Date(now).getTime() - days * 86400000).toISOString();
  const progress = { players: 0, matches: 0 };

  async function read(table) {
    const rows = [];
    let cursor = null;
    let total = null;
    while (true) {
      checkAbort(signal);
      let query = client.from(table).select(COLUMNS[table], { count: "exact" })
        .eq("league_id", leagueId).lte("created_at", asOf)
        .order("id", { ascending: true }).limit(PAGE_SIZE);
      if (table === "matches" && cutoff) query = query.gte("created_at", cutoff);
      if (cursor) query = query.gt("id", cursor);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      checkAbort(signal);
      if (error) throw new Error("Could not load the full report. Check your connection and league access, then retry.");
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) {
        throw new Error("Could not verify the report's completeness. Please retry.");
      }
      if (total === null) total = count;
      if (total > MAX_ROWS) throw new Error("This report is too large. Choose a shorter period.");
      if (count !== total - rows.length || data.length > PAGE_SIZE || data.length > count || (count > 0 && data.length === 0)) {
        throw new Error("League records changed or a page was incomplete. Refresh the report.");
      }
      for (const row of data) {
        const id = typeof row?.id === "string" ? row.id.toLowerCase() : null;
        if (!UUID.test(id) || row.league_id !== leagueId || (cursor && id <= cursor)) {
          throw new Error("The report returned inconsistent records. Please retry.");
        }
        cursor = id;
        // Defense in depth: discard unexpected fields even if an API/mock adds them.
        rows.push(Object.fromEntries(COLUMNS[table].split(",").map((key) => [key, row[key]])));
      }
      progress[table] = rows.length;
      onProgress?.({ ...progress });
      if (rows.length === total) return rows;
    }
  }

  // Sequential on purpose: at most one page is in flight, with bounded work on
  // mobile connections. Leaving the panel aborts the active request.
  const players = await read("players");
  const matches = await read("matches");
  return { leagueId, days, asOf, players, matches };
}
