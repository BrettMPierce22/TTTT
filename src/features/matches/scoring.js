export function getMatchResult(match) {
  let aWins = 0;
  let bWins = 0;

  const games = Array.isArray(match?.games)
    ? match.games
    : [];

  games.forEach((game) => {
    if (Number(game.a) > Number(game.b)) {
      aWins++;
    } else {
      bWins++;
    }
  });

  return {
    aWins,
    bWins,
    winnerId:
      aWins > bWins
        ? match.player_a_id
        : match.player_b_id,
  };
}

export function validateMatchScores(format, scoreRows) {
  if (![1, 3, 5].includes(format) || !Array.isArray(scoreRows)) throw new Error("Choose Best of 1, 3 or 5.");
  const blank = (value) => value == null || (typeof value === "string" && value.trim() === "");
  if (scoreRows.slice(format).some((game) => !blank(game?.a) || !blank(game?.b))) throw new Error("Remove games beyond the selected match format.");
  const rows = scoreRows.slice(0, format);

  const usableGames = [];

  rows.forEach((game) => {
    const aBlank =
      blank(game?.a);

    const bBlank =
      blank(game?.b);

    if (aBlank && bBlank) {
      return;
    }

    if (aBlank || bBlank) {
      throw new Error(
        "Enter both scores for every game you use."
      );
    }

    const scoreA = Number(game.a);
    const scoreB = Number(game.b);

    if (
      !Number.isInteger(scoreA) ||
      !Number.isInteger(scoreB) ||
      scoreA < 0 ||
      scoreB < 0
    ) {
      throw new Error(
        "Game scores must be whole numbers of 0 or greater."
      );
    }

    if (scoreA === scoreB) {
      throw new Error(
        "Games cannot end in a tie."
      );
    }

    usableGames.push({
      a: scoreA,
      b: scoreB,
    });
  });

  if (usableGames.length === 0) {
    throw new Error(
      "Enter at least one game score."
    );
  }

  const winsNeeded =
    format === 1
      ? 1
      : format === 3
      ? 2
      : 3;

  let aWins = 0;
  let bWins = 0;

  usableGames.forEach((game, index) => {
    if (
      aWins >= winsNeeded ||
      bWins >= winsNeeded
    ) {
      throw new Error(
        `Game ${index + 1} comes after the match was already decided. Remove the extra game.`
      );
    }

    if (game.a > game.b) {
      aWins++;
    } else {
      bWins++;
    }
  });

  if (
    Math.max(aWins, bWins) !==
    winsNeeded
  ) {
    throw new Error(
      format === 1
        ? "Enter the final score."
        : `A Best of ${format} match needs a player to win ${winsNeeded} games.`
    );
  }

  return usableGames;
}


function expectedScore(rating, opponentRating) {
  return (
    1 /
    (1 +
      Math.pow(
        10,
        (opponentRating - rating) / 400
      ))
  );
}

function getQualification(matchesPlayed) {
  if (matchesPlayed === 0) {
    return "unranked";
  }

  if (matchesPlayed < 5) {
    return "provisional";
  }

  return "ranked";
}

function getRatingExchangePoints(
  differential,
  higherRatedWon
) {
  const spread = Math.abs(
    Math.round(differential)
  );

  const rows = [
    [12, 8, 8],
    [37, 7, 10],
    [62, 6, 13],
    [87, 5, 16],
    [112, 4, 20],
    [137, 3, 25],
    [162, 2, 30],
    [187, 2, 35],
    [212, 1, 40],
    [237, 1, 45],
    [Infinity, 0, 50],
  ];

  const row = rows.find(
    ([max]) => spread <= max
  );

  return higherRatedWon
    ? row[1]
    : row[2];
}

export function calculateLeagueAnalytics(players, matches) {
  const stats = {};
  const playerHistory = {};
  const matchAnalytics = {};

  players.forEach((player) => {
    stats[player.id] = {
      ...player,
      rating: 1000,
      powerRating: 1000,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      winStreak: 0,
    };

    playerHistory[player.id] = [];
  });

  const orderedMatches = [...matches].sort(
    (a, b) =>
      new Date(a.created_at) -
      new Date(b.created_at)
  );

  orderedMatches.forEach((match) => {
    const a = stats[match.player_a_id];
    const b = stats[match.player_b_id];

    if (!a || !b) return;

    let aGames = 0;
    let bGames = 0;
    let aPoints = 0;
    let bPoints = 0;

    const games = Array.isArray(match.games)
      ? match.games
      : [];

    games.forEach((game) => {
      const scoreA = Number(game.a);
      const scoreB = Number(game.b);

      aPoints += scoreA;
      bPoints += scoreB;

      if (scoreA > scoreB) {
        aGames++;
      } else {
        bGames++;
      }
    });

    const aWon = aGames > bGames;
    const ratingBeforeA = a.rating;
    const ratingBeforeB = b.rating;
    const expectedA = expectedScore(
      ratingBeforeA,
      ratingBeforeB
    );
    const expectedB = 1 - expectedA;

    const differential =
      Math.abs(
        ratingBeforeA -
        ratingBeforeB
      );

    const higherRatedWon = aWon
      ? ratingBeforeA >= ratingBeforeB
      : ratingBeforeB >= ratingBeforeA;
    const exchange = getRatingExchangePoints(
      differential,
      higherRatedWon
    );

    if (aWon) {
      a.rating =
        ratingBeforeA + exchange;
      b.rating =
        ratingBeforeB - exchange;
    } else {
      b.rating =
        ratingBeforeB + exchange;
      a.rating =
        ratingBeforeA - exchange;
    }

    // Keep the legacy power fields synchronized with the
    // league rating so older UI/history references remain safe.
    a.powerRating = a.rating;
    b.powerRating = b.rating;

    a.gamesWon += aGames;
    a.gamesLost += bGames;
    b.gamesWon += bGames;
    b.gamesLost += aGames;

    a.pointsFor += aPoints;
    a.pointsAgainst += bPoints;
    b.pointsFor += bPoints;
    b.pointsAgainst += aPoints;

    if (aWon) {
      a.wins++;
      b.losses++;
      a.winStreak++;
      b.winStreak = 0;
    } else {
      b.wins++;
      a.losses++;
      b.winStreak++;
      a.winStreak = 0;
    }

    const totalPoints = aPoints + bPoints;
    const pointShareA =
      totalPoints === 0
        ? 0.5
        : aPoints / totalPoints;
    const pointShareB = 1 - pointShareA;

    const aSnapshot = {
      matchId: match.id,
      createdAt: match.created_at,
      opponentId: b.id,
      won: aWon,
      gamesFor: aGames,
      gamesAgainst: bGames,
      pointsFor: aPoints,
      pointsAgainst: bPoints,
      pointDifferential: aPoints - bPoints,
      pointShare: pointShareA,
      opponentRatingBefore:
        ratingBeforeB,
      eloBefore: ratingBeforeA,
      eloAfter: a.rating,
      eloChange:
        a.rating - ratingBeforeA,
      powerBefore: ratingBeforeA,
      powerAfter: a.rating,
      powerChange:
        a.rating - ratingBeforeA,
      expectedElo: expectedA,
      expectedPower: expectedA,
      ratingExchange:
        aWon ? exchange : -exchange,
    };

    const bSnapshot = {
      matchId: match.id,
      createdAt: match.created_at,
      opponentId: a.id,
      won: !aWon,
      gamesFor: bGames,
      gamesAgainst: aGames,
      pointsFor: bPoints,
      pointsAgainst: aPoints,
      pointDifferential: bPoints - aPoints,
      pointShare: pointShareB,
      opponentRatingBefore:
        ratingBeforeA,
      eloBefore: ratingBeforeB,
      eloAfter: b.rating,
      eloChange:
        b.rating - ratingBeforeB,
      powerBefore: ratingBeforeB,
      powerAfter: b.rating,
      powerChange:
        b.rating - ratingBeforeB,
      expectedElo: expectedB,
      expectedPower: expectedB,
      ratingExchange:
        !aWon ? exchange : -exchange,
    };

    playerHistory[a.id].push(aSnapshot);
    playerHistory[b.id].push(bSnapshot);

    matchAnalytics[match.id] = {
      a: aSnapshot,
      b: bSnapshot,
      aGames,
      bGames,
      aPoints,
      bPoints,
      winnerId: aWon ? a.id : b.id,
      loserId: aWon ? b.id : a.id,
    };
  });

  const standings = Object.values(stats).map(
    (player) => {
      const matchesPlayed =
        player.wins + player.losses;

      const winPercentage =
        matchesPlayed === 0
          ? 0
          : Math.round(
              (player.wins /
                matchesPlayed) *
                100
            );

      const totalPoints =
        player.pointsFor +
        player.pointsAgainst;

      const pointsWonPercentage =
        totalPoints === 0
          ? 0
          : Math.round(
              (player.pointsFor /
                totalPoints) *
                1000
            ) / 10;

      const history =
        playerHistory[player.id] || [];

      const averageOpponentRating =
        history.length === 0
          ? null
          : Math.round(
              history.reduce(
                (sum, item) =>
                  sum +
                  Number(
                    item.opponentRatingBefore ||
                      1000
                  ),
                0
              ) / history.length
            );

      return {
        ...player,
        rating: Math.round(player.rating),
        powerRating: Math.round(
          player.rating
        ),
        matchesPlayed,
        qualification:
          getQualification(matchesPlayed),
        gamesPlayed:
          player.gamesWon +
          player.gamesLost,
        winPercentage,
        pointsWonPercentage,
        averageOpponentRating,
        pointDifferential:
          player.pointsFor -
          player.pointsAgainst,
      };
    }
  );

  const order = {
    ranked: 0,
    provisional: 1,
    unranked: 2,
  };

  const leagueStandings =
    [...standings].sort((a, b) => {
      if (
        order[a.qualification] !==
        order[b.qualification]
      ) {
        return (
          order[a.qualification] -
          order[b.qualification]
        );
      }

      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }

      if (
        b.averageOpponentRating !==
        a.averageOpponentRating
      ) {
        return (
          (b.averageOpponentRating || 0) -
          (a.averageOpponentRating || 0)
        );
      }

      if (
        b.matchesPlayed !==
        a.matchesPlayed
      ) {
        return (
          b.matchesPlayed -
          a.matchesPlayed
        );
      }

      return a.name.localeCompare(b.name);
    });

  let officialRank = 0;

  const rankedStandings =
    leagueStandings.map((player) => {
      if (
        player.qualification === "ranked"
      ) {
        officialRank++;

        return {
          ...player,
          officialRank,
        };
      }

      return {
        ...player,
        officialRank: null,
      };
    });

  return {
    standings: rankedStandings,
    eloStandings: rankedStandings,
    powerStandings: rankedStandings,
    playerHistory,
    matchAnalytics,
  };
}
