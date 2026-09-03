// Reports use only the already-authorized league data in memory. Never fetch
// private account fields or include user IDs, contact details, or join codes.
const DAY = 86400000;

function completedScore(match) {
  const format = Number(match.format);
  if (![1, 3, 5].includes(format) || !Array.isArray(match.games) ||
      !match.player_a_id || !match.player_b_id || match.player_a_id === match.player_b_id ||
      match.games.length > format) return null;
  const needed = Math.floor(format / 2) + 1;
  let aWins = 0, bWins = 0, aPoints = 0, bPoints = 0;
  for (const game of match.games) {
    if (aWins === needed || bWins === needed || !game ||
        [game.a, game.b].some((value) => !["number", "string"].includes(typeof value) || String(value).trim() === "")) return null;
    const a = Number(game.a), b = Number(game.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) return null;
    if (a > b) aWins++; else bWins++;
    aPoints += a; bPoints += b;
  }
  return Math.max(aWins, bWins) === needed ? { aWins, bWins, aPoints, bPoints } : null;
}

export function buildOrganizerReport({ leagueId, players = [], matches = [], days = 30, now = new Date() }) {
  const end = new Date(now).getTime();
  if (!Number.isFinite(end) || ![30, 90, null].includes(days)) throw new Error("Choose a valid report period.");
  const cutoff = days === null ? -Infinity : end - days * DAY;
  const roster = players.filter((player) => player.league_id === leagueId);
  const byId = new Map(roster.map((player) => [player.id, {
    id: player.id, name: player.name || "Former player", active: player.is_active !== false,
    matches: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
  }]));
  const matchRows = [];
  let skipped = 0;
  for (const match of matches) {
    if (match.league_id !== leagueId) continue;
    const playedAt = Date.parse(match.created_at);
    if (!Number.isFinite(playedAt)) { skipped++; continue; }
    if (playedAt < cutoff || playedAt > end) continue;
    const score = completedScore(match);
    if (!score) { skipped++; continue; }
    const a = byId.get(match.player_a_id), b = byId.get(match.player_b_id);
    const aWon = score.aWins > score.bWins;
    for (const [player, won, pointsFor, pointsAgainst] of [
      [a, aWon, score.aPoints, score.bPoints], [b, !aWon, score.bPoints, score.aPoints],
    ]) {
      if (!player) continue;
      player.matches++;
      if (won) player.wins++; else player.losses++;
      player.pointsFor += pointsFor; player.pointsAgainst += pointsAgainst;
    }
    matchRows.push({
      playedAt: new Date(playedAt).toISOString(), playerA: a?.name || "Former player",
      playerB: b?.name || "Former player", format: Number(match.format),
      games: match.games.map((game) => Number(game.a) + "–" + Number(game.b)).join("; "),
      winner: (aWon ? a?.name : b?.name) || "Former player",
    });
  }
  matchRows.sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const playerRows = [...byId.values()].map((player) => ({
    ...player, winRate: player.matches ? Math.round(player.wins * 100 / player.matches) : 0,
  })).sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
  const activePlayers = playerRows.filter((player) => player.active).length;
  const participatingPlayers = playerRows.filter((player) => player.active && player.matches > 0).length;
  return {
    matchRows, playerRows, skipped, activePlayers, participatingPlayers,
    participationRate: activePlayers ? Math.round(participatingPlayers * 100 / activePlayers) : 0,
    completedMatches: matchRows.length,
    periodLabel: days === null ? "All time" : "Last " + days + " days",
  };
}

export function csvCell(value) {
  let text = String(value ?? "");
  // Quoting CSV alone does not stop spreadsheet formula execution. Prefix
  // user-controlled formula-like text, including leading whitespace/control chars.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function createReportCsv(report, kind) {
  let rows;
  if (kind === "players") {
    rows = [
      ["Player", "Roster status", "Matches", "Wins", "Losses", "Win rate (%)", "Points for", "Points against"],
      ...report.playerRows.map((player) => [
        player.name, player.active ? "Active" : "Inactive", player.matches, player.wins,
        player.losses, player.winRate, player.pointsFor, player.pointsAgainst,
      ]),
    ];
  } else if (kind === "matches") {
    rows = [
      ["Played at (UTC)", "Player A", "Player B", "Best of", "Game scores (A–B)", "Winner"],
      ...report.matchRows.map((match) => [match.playedAt, match.playerA, match.playerB, match.format, match.games, match.winner]),
    ];
  } else throw new Error("Unknown report type.");
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function reportFilename(leagueName, kind, days, now = new Date()) {
  if (!["players", "matches"].includes(kind)) throw new Error("Unknown report type.");
  const slug = String(leagueName || "league").normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "league";
  return slug + "-" + kind + "-" + (days === null ? "all" : days + "d") + "-" + now.toISOString().slice(0, 10) + ".csv";
}
