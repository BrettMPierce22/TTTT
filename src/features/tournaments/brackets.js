export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function nextPowerOfTwo(value) {
  let result = 2;
  while (result < value) result *= 2;
  return result;
}

function bracketSeedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2;
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return order;
}

export function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function winnerRoundLabel(round, roundCount) {
  if (round === roundCount) return "Championship";
  if (round === roundCount - 1) return "Semifinals";
  if (round === roundCount - 2) return "Quarterfinals";
  return `Round ${round}`;
}

function baseMatch(tournamentId, bracket, roundNumber, matchNumber, label) {
  return {
    id: createId(),
    tournament_id: tournamentId,
    bracket,
    round_number: roundNumber,
    match_number: matchNumber,
    label,
    player_a_entry_id: null,
    player_b_entry_id: null,
    winner_entry_id: null,
    loser_entry_id: null,
    score_a: null,
    score_b: null,
    status: "scheduled",
    game_scores: [],
    winner_next_match_id: null,
    winner_next_slot: null,
    loser_next_match_id: null,
    loser_next_slot: null,
  };
}

function placeAdvancingEntry(matchById, matchId, slot, entryId) {
  if (!matchId || !entryId) return;
  const target = matchById.get(matchId);
  if (!target) return;
  if (slot === "a") target.player_a_entry_id = entryId;
  if (slot === "b") target.player_b_entry_id = entryId;
}

function resolveOpeningByes(openingMatches, matchById) {
  if (!openingMatches.length) return;
  const matches = [...matchById.values()];
  let changed = true;
  while (changed) {
    changed = false;
    matches.forEach((match) => {
    if (match.status !== "scheduled" || (match.bracket === "grand_final" && match.round_number === 2)) return;
    const feeders = matches.filter((source) => source.winner_next_match_id === match.id || source.loser_next_match_id === match.id);
    if (feeders.some((source) => !["complete", "cancelled"].includes(source.status))) return;
    const entrants = [match.player_a_entry_id, match.player_b_entry_id].filter(Boolean);
    if (entrants.length === 0) { match.status = "cancelled"; changed = true; return; }
    if (entrants.length !== 1) return;
    changed = true;
    match.winner_entry_id = entrants[0];
    match.score_a = 0;
    match.score_b = 0;
    match.status = "complete";
    placeAdvancingEntry(
      matchById,
      match.winner_next_match_id,
      match.winner_next_slot,
      entrants[0]
    );
  });
  }
}

function buildWinnerRounds(tournament, entries) {
  const size = nextPowerOfTwo(entries.length);
  const roundCount = Math.log2(size);
  const seedOrder = bracketSeedOrder(size);
  const bySeed = new Map(entries.map((entry) => [Number(entry.seed), entry]));
  const slots = seedOrder.map((seed) => bySeed.get(seed)?.id || null);
  const rounds = [];

  for (let round = 1; round <= roundCount; round += 1) {
    const matchCount = size / 2 ** round;
    const roundMatches = Array.from({ length: matchCount }, (_, index) =>
      baseMatch(
        tournament.id,
        "winners",
        round,
        index + 1,
        winnerRoundLabel(round, roundCount)
      )
    );
    rounds.push(roundMatches);
  }

  rounds[0].forEach((match, index) => {
    match.player_a_entry_id = slots[index * 2] || null;
    match.player_b_entry_id = slots[index * 2 + 1] || null;
  });

  for (let round = 0; round < rounds.length - 1; round += 1) {
    rounds[round].forEach((match, index) => {
      match.winner_next_match_id = rounds[round + 1][Math.floor(index / 2)].id;
      match.winner_next_slot = index % 2 === 0 ? "a" : "b";
    });
  }

  return { rounds, roundCount };
}

function buildSingleElimination(tournament, entries) {
  const { rounds, roundCount } = buildWinnerRounds(tournament, entries);
  const matches = rounds.flat();

  if (tournament.include_third_place && roundCount >= 2) {
    const thirdPlace = baseMatch(tournament.id, "third_place", 1, 1, "Third Place");
    const semifinals = rounds[roundCount - 2];
    semifinals.forEach((match, index) => {
      match.loser_next_match_id = thirdPlace.id;
      match.loser_next_slot = index === 0 ? "a" : "b";
    });
    matches.push(thirdPlace);
  }

  const matchById = new Map(matches.map((match) => [match.id, match]));
  resolveOpeningByes(rounds[0], matchById);
  return matches;
}

function buildDoubleElimination(tournament, entries) {
  const { rounds: winnerRounds, roundCount } = buildWinnerRounds(tournament, entries);
  if (roundCount < 2) return buildSingleElimination(tournament, entries);

  const loserRounds = [];
  const size = nextPowerOfTwo(entries.length);
  const loserRoundCount = 2 * (roundCount - 1);

  for (let round = 1; round <= loserRoundCount; round += 1) {
    const pairIndex = Math.ceil(round / 2);
    const matchCount = size / 2 ** (pairIndex + 1);
    loserRounds.push(
      Array.from({ length: matchCount }, (_, index) =>
        baseMatch(
          tournament.id,
          "losers",
          round,
          index + 1,
          round === loserRoundCount ? "Losers Final" : `Losers Round ${round}`
        )
      )
    );
  }

  winnerRounds[0].forEach((match, index) => {
    const target = loserRounds[0][Math.floor(index / 2)];
    match.loser_next_match_id = target.id;
    match.loser_next_slot = index % 2 === 0 ? "a" : "b";
  });

  for (let round = 1; round <= roundCount - 1; round += 1) {
    const targetRound = loserRounds[round * 2 - 1];
    winnerRounds[round].forEach((match, index) => {
      const targetIndex = targetRound.length - index - 1;
      match.loser_next_match_id = targetRound[targetIndex].id;
      match.loser_next_slot = "b";
    });
  }

  loserRounds.forEach((roundMatches, roundIndex) => {
    if (roundIndex === loserRounds.length - 1) return;
    const nextRound = loserRounds[roundIndex + 1];
    roundMatches.forEach((match, index) => {
      if ((roundIndex + 1) % 2 === 1) {
        match.winner_next_match_id = nextRound[index].id;
        match.winner_next_slot = "a";
      } else {
        match.winner_next_match_id = nextRound[Math.floor(index / 2)].id;
        match.winner_next_slot = index % 2 === 0 ? "a" : "b";
      }
    });
  });

  const grandFinal = baseMatch(tournament.id, "grand_final", 1, 1, "Grand Final");
  const resetFinal = tournament.grand_final_reset
    ? baseMatch(tournament.id, "grand_final", 2, 1, "Grand Final Reset")
    : null;
  const winnerFinal = winnerRounds[winnerRounds.length - 1][0];
  const loserFinal = loserRounds[loserRounds.length - 1][0];
  winnerFinal.winner_next_match_id = grandFinal.id;
  winnerFinal.winner_next_slot = "a";
  loserFinal.winner_next_match_id = grandFinal.id;
  loserFinal.winner_next_slot = "b";
  if (resetFinal) {
    grandFinal.winner_next_match_id = resetFinal.id;
    grandFinal.winner_next_slot = "a";
  }

  const matches = [
    ...winnerRounds.flat(),
    ...loserRounds.flat(),
    grandFinal,
    ...(resetFinal ? [resetFinal] : []),
  ];
  const matchById = new Map(matches.map((match) => [match.id, match]));
  resolveOpeningByes(winnerRounds[0], matchById);
  return matches;
}

function buildRoundRobin(tournament, entries) {
  const rotating = [...entries];
  if (rotating.length % 2 === 1) rotating.push(null);
  const roundCount = rotating.length - 1;
  const half = rotating.length / 2;
  const matches = [];

  for (let round = 1; round <= roundCount; round += 1) {
    for (let index = 0; index < half; index += 1) {
      const left = rotating[index];
      const right = rotating[rotating.length - 1 - index];
      if (!left || !right) continue;
      const match = baseMatch(
        tournament.id,
        "round_robin",
        round,
        index + 1,
        `Round ${round}`
      );
      match.player_a_entry_id = round % 2 === 0 ? right.id : left.id;
      match.player_b_entry_id = round % 2 === 0 ? left.id : right.id;
      matches.push(match);
    }
    rotating.splice(1, 0, rotating.pop());
  }
  return matches;
}

export function buildTournamentMatches(tournament, entries) {
  if (!tournament?.id || !["single_elimination", "double_elimination", "round_robin"].includes(tournament.format)) throw new Error("Choose a valid tournament format.");
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 128) throw new Error("Choose between 2 and 128 entrants.");
  if (tournament.format === "double_elimination" && entries.length < 3) throw new Error("Double elimination needs at least three entrants.");
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length || entries.some((entry) => !entry.id)) throw new Error("Every entrant must be unique.");
  const seeds = entries.map((entry) => Number(entry.seed)).sort((a, b) => a - b);
  if (seeds.some((seed, index) => seed !== index + 1)) throw new Error("Seeds must be unique and consecutive, starting at 1.");
  if (tournament.format === "round_robin") {
    return buildRoundRobin(tournament, entries);
  }
  if (tournament.format === "double_elimination") {
    return buildDoubleElimination(tournament, entries);
  }
  return buildSingleElimination(tournament, entries);
}
