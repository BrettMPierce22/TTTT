// A 128-player round robin has 8,128 matches, beyond a single API response.
export async function loadTournamentMatches(client, tournamentId, isCurrent = () => true) {
  const rows = [];
  const ids = new Set();
  let expected;
  while (isCurrent()) {
    const { data, count, error } = await client.from("tournament_matches")
      .select("*", { count: "exact" }).eq("tournament_id", tournamentId)
      .order("id").range(rows.length, rows.length + 249);
    if (!isCurrent()) return [];
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isInteger(count) || count < 0 || count > 8192) throw new Error("Could not verify the complete tournament schedule.");
    if (expected === undefined) expected = count;
    if (count !== expected || (data.length === 0 && rows.length < expected)) throw new Error("The tournament changed while loading. Please refresh.");
    for (const match of data) {
      if (!match.id || match.tournament_id !== tournamentId || ids.has(match.id)) throw new Error("Could not verify the complete tournament schedule.");
      rows.push(match); ids.add(match.id);
    }
    if (rows.length > expected) throw new Error("The tournament changed while loading. Please refresh.");
    if (rows.length === expected) return rows.sort((a, b) => a.round_number - b.round_number || a.match_number - b.match_number);
  }
  return [];
}
