export function canRecordTournamentMatch(match, matches) {
  if (!match || match.status !== "scheduled" || !(match.player_a_entry_id || match.player_b_entry_id)) return false;
  return matches.filter((source) => source.winner_next_match_id === match.id || source.loser_next_match_id === match.id)
    .every((source) => ["complete", "cancelled"].includes(source.status));
}

export function validateTournamentScore(bestOf, a, b) {
  if (![1, 3, 5, 7].includes(Number(bestOf))) throw new Error("Choose a supported match format.");
  const values = [a, b].map((value) => {
    if (value == null || String(value).trim() === "") throw new Error("Enter both game-win totals.");
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) throw new Error("Game wins must be whole numbers of 0 or greater.");
    return number;
  });
  const needed = (Number(bestOf) + 1) / 2;
  if (Math.max(...values) !== needed || Math.min(...values) >= needed) throw new Error(`The winner needs exactly ${needed} game wins and the opponent must have fewer.`);
  return values;
}
