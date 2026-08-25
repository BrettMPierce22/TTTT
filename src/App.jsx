import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import tableTalkAppIcon from "./assets/table-talk-app-icon.png";
import { supabase } from "./lib/supabaseClient";
import {
  NATIVE_TAB_NAMES,
  canUseNativeShell,
  listenForNativeTabSelection,
  setNativeTabBadge,
  setNativeTabsVisible,
  setSelectedNativeTab,
} from "./native/nativeShell";

const TableLocator = lazy(() =>
  import("./features/table-locator/TableLocator")
);
const TournamentCenter = lazy(() =>
  import("./features/tournaments/TournamentCenter")
);
const ChatCenter = lazy(() => import("./features/chat/ChatCenter"));
const ModeratorQueue = lazy(() =>
  import("./features/moderation/ModeratorQueue")
);
const LegalCenter = lazy(() => import("./features/legal/LegalCenter"));

// Authentication emails must open a real HTTPS page. A Capacitor build runs
// from capacitor://localhost, which is not a valid email callback URL.
const APP_URL =
  import.meta.env.VITE_APP_URL || "https://tabletalktabletennis.com";
const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL || "support@tabletalktabletennis.com";
const LEGAL_PAGE_KEYS = new Set(["privacy", "terms", "community", "support"]);

function getLegalPageFromHash() {
  const page = window.location.hash.replace(/^#\/?(?:legal\/)?/, "");
  return LEGAL_PAGE_KEYS.has(page) ? page : null;
}

function BrandMark({ className = "" }) {
  return (
    <span className={`brand-mark-shell ${className}`.trim()} aria-hidden="true">
      <img src={tableTalkAppIcon} alt="" />
    </span>
  );
}

function LegalLinks({ onNavigate }) {
  return (
    <div className="legal-links">
      <button type="button" onClick={() => onNavigate("privacy")}>
        Privacy
      </button>
      <button type="button" onClick={() => onNavigate("terms")}>
        Terms
      </button>
      <button type="button" onClick={() => onNavigate("community")}>
        Community
      </button>
      <button type="button" onClick={() => onNavigate("support")}>
        Support
      </button>
    </div>
  );
}

function AppIcon({ name, size = 18, className = "" }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: `app-icon ${className}`.trim(),
    "aria-hidden": true,
  };

  const icons = {
    paddle: (
      <svg {...common}>
        <path d="M5.2 5.2a6.1 6.1 0 0 1 8.6 0l.9.9a6.1 6.1 0 0 1 0 8.6l-.8.8-9.5-9.5.8-.8Z" />
        <path d="m11.9 13.9 6.4 6.4" />
        <circle cx="18.4" cy="6.1" r="2.1" fill="currentColor" stroke="none" />
      </svg>
    ),
    home: (
      <svg {...common}>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9 21v-7h6v7" />
      </svg>
    ),
    location: (
      <svg {...common}>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
    trophy: (
      <svg {...common}>
        <path d="M8 4h8v4.5a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H4v1.5A4.5 4.5 0 0 0 8.5 12" />
        <path d="M16 6h4v1.5a4.5 4.5 0 0 1-4.5 4.5" />
        <path d="M12 12.5V17" />
        <path d="M8 21h8" />
        <path d="M9.5 17h5" />
      </svg>
    ),
    bracket: (
      <svg {...common}>
        <rect x="3" y="3" width="6" height="5" rx="1" />
        <rect x="3" y="16" width="6" height="5" rx="1" />
        <rect x="15" y="9.5" width="6" height="5" rx="1" />
        <path d="M9 5.5h3v6.5h3M9 18.5h3V12" />
      </svg>
    ),
    plus: (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
    users: (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    user: (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
    history: (
      <svg {...common}>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    settings: (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </svg>
    ),
    lock: (
      <svg {...common}>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    ),
    chat: (
      <svg {...common}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    ),
    sun: (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </svg>
    ),
    moon: (
      <svg {...common}>
        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8Z" />
      </svg>
    ),
    copy: (
      <svg {...common}>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
    more: (
      <svg {...common}>
        <circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none" />
      </svg>
    ),
    logout: (
      <svg {...common}>
        <path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5" />
        <path d="m14 8 4 4-4 4" />
        <path d="M18 12H9" />
      </svg>
    ),
    chart: (
      <svg {...common}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  };

  return icons[name] || icons.paddle;
}

function ThemeControl({ theme, onChange, saving = false }) {
  return (
    <div className="theme-control" role="group" aria-label="Display mode">
      <button
        type="button"
        className={theme === "light" ? "theme-option-active" : ""}
        onClick={() => onChange("light")}
        disabled={saving}
      >
        <AppIcon name="sun" size={16} />
        Light
      </button>
      <button
        type="button"
        className={theme === "dark" ? "theme-option-active" : ""}
        onClick={() => onChange("dark")}
        disabled={saving}
      >
        <AppIcon name="moon" size={16} />
        Dark
      </button>
    </div>
  );
}

function PlayerAvatar({ player, size = "medium" }) {
  const initial = player?.name
    ? player.name.charAt(0).toUpperCase()
    : "?";

  return (
    <div className={`player-avatar player-avatar-${size}`}>
      {player?.avatar_url ? (
        <img
          src={player.avatar_url}
          alt={`${player.name} profile`}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const isOpen = status === "open";

  return (
    <span
      className={`status-badge ${
        isOpen ? "status-open" : "status-idle"
      }`}
    >
      <span className="status-dot" />
      {isOpen ? "Open to Play" : "Idle"}
    </span>
  );
}

function getMatchResult(match) {
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

function validateMatchScores(format, scoreRows) {
  const rows = scoreRows.slice(0, format);

  const usableGames = [];

  rows.forEach((game) => {
    const aBlank =
      game.a === "" ||
      game.a === null ||
      game.a === undefined;

    const bBlank =
      game.b === "" ||
      game.b === null ||
      game.b === undefined;

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

function calculateLeagueAnalytics(players, matches) {
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

    let exchange = 0;

    if (aWon) {
      const higherRatedWon =
        ratingBeforeA >= ratingBeforeB;

      exchange =
        getRatingExchangePoints(
          differential,
          higherRatedWon
        );

      a.rating =
        ratingBeforeA + exchange;
      b.rating =
        ratingBeforeB - exchange;
    } else {
      const higherRatedWon =
        ratingBeforeB >= ratingBeforeA;

      exchange =
        getRatingExchangePoints(
          differential,
          higherRatedWon
        );

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

function LeagueLandscapeChart({
  players,
  onPlayerClick,
}) {
  const plotted = (players || []).filter(
    (player) => player.is_active
  );

  if (plotted.length === 0) {
    return (
      <div className="league-landscape-empty">
        Player ratings will appear here once the league has members.
      </div>
    );
  }

  const width = 760;
  const height = 330;
  const left = 54;
  const right = 34;
  const top = 34;
  const bottom = 52;

  const maxMatches = Math.max(
    5,
    ...plotted.map((player) => player.matchesPlayed || 0)
  );

  const ratings = plotted.map((player) => player.rating || 1000);

  let minRating = Math.min(...ratings);
  let maxRating = Math.max(...ratings);

  if (minRating === maxRating) {
    minRating -= 25;
    maxRating += 25;
  } else {
    minRating -= 15;
    maxRating += 15;
  }

  const xFor = (matchesPlayed) =>
    left +
    ((matchesPlayed || 0) / maxMatches) *
      (width - left - right);

  const yFor = (rating) =>
    top +
    ((maxRating - rating) / (maxRating - minRating)) *
      (height - top - bottom);

  const ratingTicks = [
    maxRating,
    (maxRating + minRating) / 2,
    minRating,
  ];

  function shortName(name, max = 14) {
    if (!name) return "";
    return name.length > max
      ? `${name.slice(0, max - 1)}…`
      : name;
  }

  const points = [...plotted]
    .map((player, index) => ({
      player,
      x: xFor(player.matchesPlayed || 0),
      y: yFor(player.rating || 1000),
      index,
    }))
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const labelPositions = {};

  points.forEach((point, index) => {
    const edgeRight = point.x > width - right - 110;
    const closeNeighbor = points.some(
      (other) =>
        other.player.id !== point.player.id &&
        Math.abs(other.x - point.x) < 48 &&
        Math.abs(other.y - point.y) < 18
    );

    const offsetY = closeNeighbor
      ? index % 2 === 0
        ? -10
        : 12
      : 0;

    labelPositions[point.player.id] = {
      x: edgeRight ? point.x - 10 : point.x + 10,
      y: point.y + offsetY,
      anchor: edgeRight ? "end" : "start",
      dashX: edgeRight ? point.x - 5 : point.x + 5,
    };
  });

  return (
    <div className="league-landscape-wrap">
      <svg
        className="league-landscape-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="League rating compared with matches played"
      >
        {ratingTicks.map((value, index) => {
          const y = yFor(value);

          return (
            <g key={index}>
              <line
                className="landscape-grid-line"
                x1={left}
                y1={y}
                x2={width - right}
                y2={y}
              />
              <text
                className="landscape-axis-text"
                x={left - 10}
                y={y + 4}
                textAnchor="end"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <line
          className="landscape-axis-line"
          x1={left}
          y1={height - bottom}
          x2={width - right}
          y2={height - bottom}
        />

        <line
          className="landscape-axis-line"
          x1={left}
          y1={top}
          x2={left}
          y2={height - bottom}
        />

        {[0, Math.ceil(maxMatches / 2), maxMatches].map((value) => {
          const x = xFor(value);

          return (
            <g key={value}>
              <line
                className="landscape-tick-line"
                x1={x}
                y1={height - bottom}
                x2={x}
                y2={height - bottom + 5}
              />
              <text
                className="landscape-axis-text"
                x={x}
                y={height - bottom + 20}
                textAnchor="middle"
              >
                {value}
              </text>
            </g>
          );
        })}

        <text
          className="landscape-axis-label"
          x={(left + width - right) / 2}
          y={height - 9}
          textAnchor="middle"
        >
          Matches Played
        </text>

        <text
          className="landscape-y-axis-label"
          x="14"
          y={(top + height - bottom) / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${(top + height - bottom) / 2})`}
        >
          League Rating
        </text>

        {plotted.map((player) => {
          const x = xFor(player.matchesPlayed || 0);
          const y = yFor(player.rating || 1000);
          const label = labelPositions[player.id];

          return (
            <g
              key={player.id}
              className={`landscape-player landscape-${player.qualification || "ranked"}`}
              role="button"
              tabIndex="0"
              onClick={() => onPlayerClick?.(player.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPlayerClick?.(player.id);
                }
              }}
            >
              <circle
                cx={x}
                cy={y}
                r={player.qualification === "ranked" ? 7 : 6}
              />

              <line
                className="landscape-name-dash"
                x1={x}
                y1={y}
                x2={label.dashX}
                y2={label.y}
              />

              <text
                className="landscape-player-name"
                x={label.x}
                y={label.y + 3}
                textAnchor={label.anchor}
              >
                {shortName(player.name)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="league-landscape-legend">
        <span>
          <i className="landscape-legend-dot landscape-legend-ranked" />
          Ranked (5+ matches)
        </span>

        <span>
          <i className="landscape-legend-dot landscape-legend-provisional" />
          Provisional (1–4)
        </span>

        <span>
          <i className="landscape-legend-dot landscape-legend-unranked" />
          Unranked
        </span>

        <small>
          Click any player dot to open their profile.
        </small>
      </div>
    </div>
  );
}

function formatSigned(value, digits = 0) {
  const number = Number(value || 0);
  const rounded =
    digits > 0
      ? number.toFixed(digits)
      : Math.round(number);

  return number > 0
    ? `+${rounded}`
    : String(rounded);
}

function filterHistoryByRange(history, range) {
  if (!Array.isArray(history)) return [];
  if (range === "all") return history;

  const now = new Date();
  const cutoff = new Date(now);

  if (range === "7d") {
    cutoff.setDate(cutoff.getDate() - 7);
  } else if (range === "30d") {
    cutoff.setDate(cutoff.getDate() - 30);
  } else if (range === "6m") {
    cutoff.setMonth(cutoff.getMonth() - 6);
  } else if (range === "1y") {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
  }

  return history.filter(
    (item) =>
      new Date(item.createdAt) >= cutoff
  );
}

function SimpleLineChart({
  data,
  valueKey,
  emptyText,
}) {
  if (!data || data.length === 0) {
    return (
      <div className="performance-chart-empty">
        {emptyText || "No matches in this period."}
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const paddingX = 32;
  const paddingY = 28;
  const values = data.map((item) =>
    Number(item[valueKey] || 0)
  );
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    min -= 10;
    max += 10;
  }

  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x =
      data.length === 1
        ? width / 2
        : paddingX +
          (index /
            (data.length - 1)) *
            (width - paddingX * 2);

    const y =
      paddingY +
      ((max - value) / range) *
        (height - paddingY * 2);

    return { x, y, value };
  });

  const pointString = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <div className="simple-chart-wrap">
      <svg
        className="simple-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Performance trend chart"
      >
        <line
          className="chart-grid-line"
          x1={paddingX}
          y1={paddingY}
          x2={width - paddingX}
          y2={paddingY}
        />
        <line
          className="chart-grid-line"
          x1={paddingX}
          y1={height / 2}
          x2={width - paddingX}
          y2={height / 2}
        />
        <line
          className="chart-grid-line"
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
        />

        {points.length > 1 && (
          <polyline
            className="chart-trend-line"
            points={pointString}
            fill="none"
          />
        )}

        {points.map((point, index) => (
          <circle
            key={index}
            className="chart-point"
            cx={point.x}
            cy={point.y}
            r="5"
          >
            <title>
              {Math.round(point.value)} after match {index + 1}
            </title>
          </circle>
        ))}
      </svg>

      <div className="chart-range-labels">
        <span>
          {new Date(
            data[0].createdAt
          ).toLocaleDateString()}
        </span>
        <strong>
          {Math.round(
            data[data.length - 1][valueKey]
          )}
        </strong>
        <span>
          {new Date(
            data[data.length - 1].createdAt
          ).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function PointDifferentialChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="performance-chart-empty">
        No matches in this period.
      </div>
    );
  }

  const maxAbs = Math.max(
    1,
    ...data.map((item) =>
      Math.abs(item.pointDifferential)
    )
  );

  return (
    <div className="point-diff-chart">
      <div className="point-diff-zero" />
      <div className="point-diff-bars">
        {data.map((item, index) => {
          const value = item.pointDifferential;
          const height = Math.max(
            5,
            (Math.abs(value) / maxAbs) * 82
          );

          return (
            <div
              className="point-diff-column"
              key={`${item.matchId}-${index}`}
            >
              <div className="point-diff-bar-area">
                <div
                  className={`point-diff-bar ${
                    value >= 0
                      ? "point-diff-positive"
                      : "point-diff-negative"
                  }`}
                  style={{
                    height: `${height}px`,
                  }}
                  title={`${formatSigned(value)} points`}
                />
              </div>
              <span>{formatSigned(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] =
    useState(null);

  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [authMode, setAuthMode] =
    useState("login");

  const [authEmail, setAuthEmail] =
    useState("");

  const [authPassword, setAuthPassword] =
    useState("");

  const [
    authConfirmPassword,
    setAuthConfirmPassword,
  ] = useState("");

  const [
    newPassword,
    setNewPassword,
  ] = useState("");

  const [
    confirmNewPassword,
    setConfirmNewPassword,
  ] = useState("");

  const [
    authLoading,
    setAuthLoading,
  ] = useState(false);

  const [
    authMessage,
    setAuthMessage,
  ] = useState("");

  const [
    authError,
    setAuthError,
  ] = useState("");

  const [
    memberships,
    setMemberships,
  ] = useState([]);

  const [hubMode, setHubMode] =
    useState("list");

  const [legalPage, setLegalPage] =
    useState(getLegalPageFromHash);

  const [league, setLeague] =
    useState(null);

  const [
    currentPlayer,
    setCurrentPlayer,
  ] = useState(null);

  const [
    currentMembership,
    setCurrentMembership,
  ] = useState(null);

  const [players, setPlayers] =
    useState([]);

  const [matches, setMatches] =
    useState([]);

  const [saving, setSaving] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [activeTab, setActiveTab] =
    useState("leaderboard");

  const [isAppModerator, setIsAppModerator] =
    useState(false);

  const [
    selectedPlayerId,
    setSelectedPlayerId,
  ] = useState(null);

  const [
    profileReturnTab,
    setProfileReturnTab,
  ] = useState("players");

  const [
    avatarUploading,
    setAvatarUploading,
  ] = useState(false);

  const [
    logoUploading,
    setLogoUploading,
  ] = useState(false);

  const [
    bannerUploading,
    setBannerUploading,
  ] = useState(false);

  const [
    statusUpdating,
    setStatusUpdating,
  ] = useState(false);

  const [
    profileSaving,
    setProfileSaving,
  ] = useState(false);

  const [joinName, setJoinName] =
    useState("");

  const [joinCode, setJoinCode] =
    useState("");

  const [leagueDirectory, setLeagueDirectory] = useState([]);
  const [leagueAccessAvailable, setLeagueAccessAvailable] = useState(false);
  const [directoryMessage, setDirectoryMessage] = useState("");
  const [pendingJoinRequests, setPendingJoinRequests] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");

  const [
    createName,
    setCreateName,
  ] = useState("");

  const [
    createLeagueName,
    setCreateLeagueName,
  ] = useState("");

  const [
    createLeagueCode,
    setCreateLeagueCode,
  ] = useState("");

  const [createAccessType, setCreateAccessType] = useState("private");

  const [playerA, setPlayerA] =
    useState("");

  const [playerB, setPlayerB] =
    useState("");

  const [recordMode, setRecordMode] =
    useState("mine");

  const [format, setFormat] =
    useState(1);

  const [
    gameScores,
    setGameScores,
  ] = useState([
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
  ]);

  const [
    editingMatch,
    setEditingMatch,
  ] = useState(null);

  const [
    editFormat,
    setEditFormat,
  ] = useState(1);

  const [
    editGameScores,
    setEditGameScores,
  ] = useState([
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
  ]);

  const [
    leagueDescriptionDraft,
    setLeagueDescriptionDraft,
  ] = useState("");

  const [
    profileNameDraft,
    setProfileNameDraft,
  ] = useState("");

  const [
    profileDescriptionDraft,
    setProfileDescriptionDraft,
  ] = useState("");

  const [
    heightDraft,
    setHeightDraft,
  ] = useState("");

  const [
    velocityDraft,
    setVelocityDraft,
  ] = useState("");

  const [
    accountProfile,
    setAccountProfile,
  ] = useState(null);

  const [
    accountNameDraft,
    setAccountNameDraft,
  ] = useState("");

  const [
    accountDescriptionDraft,
    setAccountDescriptionDraft,
  ] = useState("");

  const [
    accountHeightDraft,
    setAccountHeightDraft,
  ] = useState("");

  const [
    accountVelocityDraft,
    setAccountVelocityDraft,
  ] = useState("");

  const [
    accountProfileSaving,
    setAccountProfileSaving,
  ] = useState(false);

  const [
    accountAvatarUploading,
    setAccountAvatarUploading,
  ] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] =
    useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountDeletionError, setAccountDeletionError] = useState("");

  const [
    rankInfoMode,
    setRankInfoMode,
  ] = useState(null);

  const [
    boardDetailMode,
    setBoardDetailMode,
  ] = useState(null);

  const [
    selectedMatch,
    setSelectedMatch,
  ] = useState(null);

  const [
    performanceRange,
    setPerformanceRange,
  ] = useState("all");

  const [themeMode, setThemeMode] = useState(() =>
    window.localStorage.getItem("tttt_theme") || "light"
  );

  const [themeSaving, setThemeSaving] = useState(false);

  const [chatUnread, setChatUnread] = useState(0);
  const [chatOpenRequest, setChatOpenRequest] = useState(0);

  const activeTabRef = useRef(activeTab);
  const nativeTabHandlerRef = useRef(null);
  const mobileHeaderMenuRef = useRef(null);

  function closeMobileHeaderMenu() {
    mobileHeaderMenuRef.current?.removeAttribute("open");
  }

  function openLegalPage(page) {
    if (!LEGAL_PAGE_KEYS.has(page)) return;
    closeMobileHeaderMenu();
    window.location.hash = `/legal/${page}`;
    setLegalPage(page);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeLegalPage() {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
    setLegalPage(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("tttt_theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    function handleHashChange() {
      setLegalPage(getLegalPageFromHash());
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  nativeTabHandlerRef.current = (tab) => {
    if (!NATIVE_TAB_NAMES.includes(tab)) return;

    if (tab === "profile") {
      openMyProfile();
    } else {
      changeTab(tab);
    }
  };

  useEffect(() => {
    if (!canUseNativeShell()) return undefined;

    const listener = listenForNativeTabSelection((tab) => {
      nativeTabHandlerRef.current?.(tab);
    });

    return () => {
      Promise.resolve(listener)
        .then((handle) => handle.remove())
        .catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!canUseNativeShell()) return;

    setNativeTabsVisible(Boolean(league) && !legalPage).catch((error) => {
      console.warn("Could not update native tab visibility", error);
    });
  }, [league, legalPage]);

  useEffect(() => {
    if (!canUseNativeShell()) return;

    const nativeTab =
      activeTab === "profile" && selectedPlayerId === currentPlayer?.id
        ? "profile"
        : NATIVE_TAB_NAMES.includes(activeTab)
          ? activeTab
          : null;

    if (nativeTab) {
      setSelectedNativeTab(nativeTab).catch((error) => {
        console.warn("Could not update the selected native tab", error);
      });
    }

    setNativeTabBadge("chat", chatUnread).catch((error) => {
      console.warn("Could not update the native chat badge", error);
    });
  }, [activeTab, chatUnread, currentPlayer?.id, selectedPlayerId]);

  useEffect(() => {
    function handleDocumentPointerDown(event) {
      const menu = mobileHeaderMenuRef.current;

      if (menu?.open && !menu.contains(event.target)) {
        closeMobileHeaderMenu();
      }
    }

    function handleScroll() {
      closeMobileHeaderMenu();
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function startApp() {
      try {
        const {
          data,
          error,
        } =
          await supabase.auth.getSession();

        if (error) throw error;

        if (!mounted) return;

        const currentSession =
  data.session || null;

if (
  currentSession?.user?.is_anonymous
) {
  await supabase.auth.signOut();

  setSession(null);
  setUser(null);
  setAuthMode("login");
} else {
  setSession(currentSession);

  setUser(
    currentSession?.user || null
  );

  if (currentSession?.user) {
    await bootstrapAuthenticatedUser(
      currentSession.user.id
    );
  }
}
      } catch (error) {
        console.error(error);

        if (mounted) {
          setAuthError(
            error.message ||
              "Could not start Table Talk Table Tennis."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    startApp();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (event, nextSession) => {
          if (!mounted) return;

          setSession(
            nextSession || null
          );

          setUser(
            nextSession?.user || null
          );

          if (
            event ===
            "PASSWORD_RECOVERY"
          ) {
            setAuthMode("reset");
            setAuthError("");
            setAuthMessage(
              "Choose a new password for your account."
            );
            setLoading(false);
            return;
          }

          if (
            event === "SIGNED_OUT"
          ) {
            resetLeagueState();
            setMemberships([]);
            setAccountProfile(null);
            setAccountNameDraft("");
            setAccountDescriptionDraft("");
            setAccountHeightDraft("");
            setAccountVelocityDraft("");
            setAuthMode("login");
            setLoading(false);
            return;
          }

          if (
            event === "SIGNED_IN" &&
            nextSession?.user
          ) {
            setTimeout(() => {
              bootstrapAuthenticatedUser(
                nextSession.user.id
              ).catch(
                console.error
              );
            }, 0);
          }
        }
      );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadModeratorRole() {
      if (!user?.id) {
        setIsAppModerator(false);
        return;
      }

      const { data, error } = await supabase
        .from("table_locator_moderators")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setIsAppModerator(!error && Boolean(data));
      }
    }

    loadModeratorRole();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!league?.id || !user?.id) {
      return;
    }

    const interval =
      setInterval(() => {
        loadLeagueData(
          league.id,
          user.id
        );
      }, 10000);

    return () =>
      clearInterval(interval);
  }, [league?.id, user?.id]);

  useEffect(() => {
    if (!league?.id || !currentPlayer?.id) {
      return;
    }

    const channel = supabase
      .channel(`league-chat-${league.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "league_messages",
          filter: `league_id=eq.${league.id}`,
        },
        (payload) => {
          if (
            payload.new?.player_id !== currentPlayer.id &&
            activeTabRef.current !== "chat"
          ) {
            setChatUnread((count) => count + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [league?.id, currentPlayer?.id]);

  useEffect(() => {
    setLeagueDescriptionDraft(
      league?.description || ""
    );
  }, [
    league?.id,
    league?.description,
  ]);

  useEffect(() => {
    setProfileNameDraft(
      currentPlayer?.name || ""
    );

    setProfileDescriptionDraft(
      currentPlayer?.profile_description ||
        ""
    );

    setHeightDraft(
      currentPlayer?.height_text || ""
    );

    setVelocityDraft(
      currentPlayer?.avg_ball_velocity ??
        ""
    );
  }, [
    currentPlayer?.id,
    currentPlayer?.name,
    currentPlayer?.profile_description,
    currentPlayer?.height_text,
    currentPlayer?.avg_ball_velocity,
  ]);

  function resetLeagueState() {
    setLeague(null);
    setCurrentPlayer(null);
    setCurrentMembership(null);
    setPlayers([]);
    setMatches([]);
    setSelectedPlayerId(null);
    setEditingMatch(null);
    setSelectedMatch(null);
    setPerformanceRange("all");
    setChatUnread(0);
    setActiveTab("leaderboard");
  }

  async function loadAccountProfile(userId) {
    if (!userId) return null;

    const { data, error } = await supabase
      .from("account_profiles")
      .select(`
        user_id,
        display_name,
        avatar_url,
        profile_description,
        height_text,
        avg_ball_velocity,
        theme_preference,
        created_at,
        updated_at
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const profile = data || {
      user_id: userId,
      display_name: "",
      avatar_url: null,
      profile_description: "",
      height_text: "",
      avg_ball_velocity: null,
      theme_preference:
        window.localStorage.getItem("tttt_theme") || "light",
    };

    setAccountProfile(profile);
    setAccountNameDraft(
      profile.display_name || ""
    );
    setAccountDescriptionDraft(
      profile.profile_description || ""
    );
    setAccountHeightDraft(
      profile.height_text || ""
    );
    setAccountVelocityDraft(
      profile.avg_ball_velocity ?? ""
    );

    const savedTheme =
      profile.theme_preference ||
      window.localStorage.getItem("tttt_theme") ||
      "light";
    setThemeMode(savedTheme);

    if (profile.display_name) {
      setJoinName((current) =>
        current || profile.display_name
      );
      setCreateName((current) =>
        current || profile.display_name
      );
    }

    return profile;
  }

  async function updateThemePreference(nextTheme) {
    if (!user?.id || !["light", "dark"].includes(nextTheme)) {
      return;
    }

    const previousTheme = themeMode;
    setThemeMode(nextTheme);

    try {
      setThemeSaving(true);

      const { data, error } = await supabase
        .from("account_profiles")
        .upsert(
          {
            user_id: user.id,
            theme_preference: nextTheme,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) throw error;

      setAccountProfile(data);
    } catch (error) {
      console.error(error);
      setThemeMode(previousTheme);
      alert(
        error.message ||
          "Could not update your display mode."
      );
    } finally {
      setThemeSaving(false);
    }
  }

  async function saveAccountProfile(event) {
    event?.preventDefault?.();

    if (!user?.id) return;

    const cleanName = accountNameDraft.trim();

    if (!cleanName) {
      alert("Enter a display name for your profile.");
      return;
    }

    let velocity = null;

    if (String(accountVelocityDraft).trim() !== "") {
      velocity = Number(accountVelocityDraft);

      if (Number.isNaN(velocity) || velocity < 0) {
        alert("Enter a valid ball velocity.");
        return;
      }
    }

    try {
      setAccountProfileSaving(true);

      const { data, error } = await supabase
        .from("account_profiles")
        .upsert(
          {
            user_id: user.id,
            display_name: cleanName,
            avatar_url:
              accountProfile?.avatar_url || null,
            profile_description:
              accountDescriptionDraft,
            height_text: accountHeightDraft,
            avg_ball_velocity: velocity,
            theme_preference: themeMode,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) throw error;

      setAccountProfile(data);
      setJoinName((current) =>
        current || cleanName
      );
      setCreateName((current) =>
        current || cleanName
      );

      alert("Account profile saved.");
    } catch (error) {
      console.error(error);
      alert(
        error.message ||
          "Could not save your account profile."
      );
    } finally {
      setAccountProfileSaving(false);
    }
  }

  async function handleAccountAvatarUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !user?.id) return;

    try {
      setAccountAvatarUploading(true);

      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file.");
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error(
          "Profile photos must be under 5 MB."
        );
      }

      const extension =
        file.name.split(".").pop()?.toLowerCase() ||
        "jpg";

      const filePath = `${user.id}/account/profile-${Date.now()}.${extension}`;

      const { error: uploadError } =
        await supabase.storage
          .from("player-avatars")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } =
        supabase.storage
          .from("player-avatars")
          .getPublicUrl(filePath);

      const { data, error } = await supabase
        .from("account_profiles")
        .upsert(
          {
            user_id: user.id,
            display_name:
              accountNameDraft.trim() ||
              accountProfile?.display_name ||
              "Player",
            avatar_url: publicUrlData.publicUrl,
            profile_description:
              accountDescriptionDraft,
            height_text: accountHeightDraft,
            avg_ball_velocity:
              String(accountVelocityDraft).trim() === ""
                ? null
                : Number(accountVelocityDraft),
            theme_preference: themeMode,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) throw error;

      setAccountProfile(data);
    } catch (error) {
      console.error(error);
      alert(
        error.message ||
          "Could not upload your profile photo."
      );
    } finally {
      setAccountAvatarUploading(false);
    }
  }

  async function syncAccountProfileToPlayer(playerId) {
    if (!playerId || !accountProfile) return;

    const velocity =
      accountProfile.avg_ball_velocity == null
        ? null
        : Number(accountProfile.avg_ball_velocity);

    const { error: profileError } = await supabase.rpc(
      "update_my_player_profile_v2",
      {
        p_player_id: playerId,
        p_description:
          accountProfile.profile_description || "",
        p_height_text:
          accountProfile.height_text || "",
        p_avg_ball_velocity: velocity,
        p_play_status: "idle",
      }
    );

    if (profileError) throw profileError;

    if (accountProfile.avatar_url) {
      const { error: avatarError } = await supabase.rpc(
        "update_my_avatar_v2",
        {
          p_player_id: playerId,
          p_avatar_url: accountProfile.avatar_url,
        }
      );

      if (avatarError) throw avatarError;
    }
  }

  async function fetchMyLeagues() {
    const {
      data,
      error,
    } = await supabase.rpc(
      "get_my_leagues"
    );

    if (error) throw error;

    const list = data || [];

    setMemberships(list);

    return list;
  }

  async function fetchLeagueDirectory() {
    const { data, error } = await supabase.rpc("get_discoverable_leagues");

    if (error) {
      const migrationMissing =
        error.code === "PGRST202" ||
        error.message?.includes("get_discoverable_leagues");

      if (migrationMissing) {
        setLeagueAccessAvailable(false);
        setLeagueDirectory([]);
        return [];
      }

      throw error;
    }

    const directory = data || [];
    setLeagueAccessAvailable(true);
    setLeagueDirectory(directory);
    return directory;
  }

  async function bootstrapAuthenticatedUser(
    userId
  ) {
    try {
      await loadAccountProfile(userId);

      const list =
        await fetchMyLeagues();

      await fetchLeagueDirectory();

      if (list.length === 0) {
        resetLeagueState();
        setHubMode("list");
        return;
      }

      const rememberedLeagueId =
        window.localStorage.getItem(
          "tttt_last_league_id"
        );

      const remembered =
        list.find(
          (membership) =>
            membership.league_id ===
            rememberedLeagueId
        );

      if (remembered) {
        await openLeague(
          remembered.league_id,
          userId,
          list
        );
        return;
      }

      if (list.length === 1) {
        await openLeague(
          list[0].league_id,
          userId,
          list
        );
        return;
      }

      resetLeagueState();
      setHubMode("list");
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not load your leagues."
      );
    }
  }

  async function openLeague(
    leagueId,
    userId = user?.id,
    membershipList = memberships
  ) {
    if (!leagueId || !userId) {
      return;
    }

    setLoading(true);

    try {
      setErrorMessage("");

      await loadLeagueData(
        leagueId,
        userId
      );

      const membership =
        membershipList.find(
          (item) =>
            item.league_id ===
            leagueId
        ) || null;

      setCurrentMembership(
        membership
      );

      window.localStorage.setItem(
        "tttt_last_league_id",
        leagueId
      );

      setActiveTab(
        "leaderboard"
      );

      setSelectedPlayerId(null);
      setHubMode("list");
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not open that league."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadLeagueData(
    leagueId,
    currentUserId = user?.id
  ) {
    const [
      leagueResult,
      playersResult,
      matchesResult,
    ] = await Promise.all([
      supabase
        .from("leagues")
        .select(`
          id,
          name,
          join_code,
          owner_user_id,
          description,
          logo_url,
          logo_path,
          banner_url,
          banner_path,
          created_at
        `)
        .eq("id", leagueId)
        .single(),

      supabase
        .from("players")
        .select(`
          id,
          league_id,
          user_id,
          name,
          member_role,
          avatar_url,
          is_active,
          removed_at,
          removal_reason,
          play_status,
          profile_description,
          height_text,
          avg_ball_velocity,
          created_at
        `)
        .eq(
          "league_id",
          leagueId
        )
        .order("created_at", {
          ascending: true,
        }),

      supabase
        .from("matches")
        .select(`
          id,
          league_id,
          player_a_id,
          player_b_id,
          format,
          games,
          created_by,
          created_at
        `)
        .eq(
          "league_id",
          leagueId
        )
        .order("created_at", {
          ascending: false,
        }),
    ]);

    if (leagueResult.error) {
      throw leagueResult.error;
    }

    if (playersResult.error) {
      throw playersResult.error;
    }

    if (matchesResult.error) {
      throw matchesResult.error;
    }

    const loadedPlayers =
      playersResult.data || [];

    const me =
      loadedPlayers.find(
        (player) =>
          player.user_id ===
            currentUserId &&
          player.is_active
      );

    if (!me) {
      resetLeagueState();

      const newMemberships =
        await fetchMyLeagues();

      if (
        newMemberships.length === 0
      ) {
        setHubMode("list");
      }

      return;
    }

    setLeague(
      leagueResult.data
    );

    setPlayers(
      loadedPlayers
    );

    setMatches(
      matchesResult.data || []
    );

    setCurrentPlayer(me);

    setCurrentMembership(
      memberships.find(
        (item) =>
          item.league_id ===
          leagueId
      ) || null
    );
  }

  async function handleLogin(
    event
  ) {
    event.preventDefault();

    try {
      setAuthLoading(true);
      setAuthError("");
      setAuthMessage("");

      const email =
        authEmail
          .trim()
          .toLowerCase();

      if (!email) {
        throw new Error(
          "Enter your email address."
        );
      }

      if (!authPassword) {
        throw new Error(
          "Enter your password."
        );
      }

      const {
        data,
        error,
      } =
        await supabase.auth
          .signInWithPassword({
            email,
            password:
              authPassword,
          });

      if (error) throw error;

      if (data.user) {
        setUser(data.user);
        setSession(data.session);

        await bootstrapAuthenticatedUser(
          data.user.id
        );
      }

      setAuthPassword("");
    } catch (error) {
      console.error(error);

      setAuthError(
        error.message ||
          "Could not sign in."
      );
    } finally {
      setAuthLoading(false);
      setLoading(false);
    }
  }

  async function handleSignup(
    event
  ) {
    event.preventDefault();

    try {
      setAuthLoading(true);
      setAuthError("");
      setAuthMessage("");

      const email =
        authEmail
          .trim()
          .toLowerCase();

      if (!email) {
        throw new Error(
          "Enter your email address."
        );
      }

      if (
        authPassword.length < 8
      ) {
        throw new Error(
          "Use a password with at least 8 characters."
        );
      }

      if (
        authPassword !==
        authConfirmPassword
      ) {
        throw new Error(
          "The passwords do not match."
        );
      }

      const {
        data,
        error,
      } =
        await supabase.auth.signUp({
          email,
          password:
            authPassword,
          options: {
            emailRedirectTo:
              APP_URL,
          },
        });

      if (error) throw error;

      setAuthPassword("");
      setAuthConfirmPassword("");

      if (data.session) {
        setSession(data.session);
        setUser(data.user);

        await bootstrapAuthenticatedUser(
          data.user.id
        );

        setAuthMessage(
          "Account created."
        );
      } else {
        setAuthMode("login");

        setAuthMessage(
          "Account created. Check your email and confirm your address, then come back here and sign in."
        );
      }
    } catch (error) {
      console.error(error);

      setAuthError(
        error.message ||
          "Could not create your account."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword(
    event
  ) {
    event.preventDefault();

    try {
      setAuthLoading(true);
      setAuthError("");
      setAuthMessage("");

      const email =
        authEmail
          .trim()
          .toLowerCase();

      if (!email) {
        throw new Error(
          "Enter the email address used for your account."
        );
      }

      const { error } =
        await supabase.auth
          .resetPasswordForEmail(
            email,
            {
              redirectTo:
                APP_URL,
            }
          );

      if (error) throw error;

      setAuthMessage(
        "Password reset email sent. Check your inbox and use the link to choose a new password."
      );
    } catch (error) {
      console.error(error);

      setAuthError(
        error.message ||
          "Could not send the password reset email."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResetPassword(
    event
  ) {
    event.preventDefault();

    try {
      setAuthLoading(true);
      setAuthError("");
      setAuthMessage("");

      if (
        newPassword.length < 8
      ) {
        throw new Error(
          "Use a password with at least 8 characters."
        );
      }

      if (
        newPassword !==
        confirmNewPassword
      ) {
        throw new Error(
          "The passwords do not match."
        );
      }

      const {
        data,
        error,
      } =
        await supabase.auth.updateUser({
          password:
            newPassword,
        });

      if (error) throw error;

      setNewPassword("");
      setConfirmNewPassword("");

      setAuthMessage(
        "Your password has been updated."
      );

      if (data.user) {
        setAuthMode("login");

        await bootstrapAuthenticatedUser(
          data.user.id
        );
      }
    } catch (error) {
      console.error(error);

      setAuthError(
        error.message ||
          "Could not update your password."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function sendMyPasswordReset() {
    if (!user?.email) {
      return;
    }

    try {
      setSaving(true);

      const { error } =
        await supabase.auth
          .resetPasswordForEmail(
            user.email,
            {
              redirectTo:
                APP_URL,
            }
          );

      if (error) throw error;

      alert(
        "Password reset email sent to your account email."
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not send password reset email."
      );
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    closeMobileHeaderMenu();

    const confirmed =
      window.confirm(
        "Sign out of Table Talk Table Tennis?"
      );

    if (!confirmed) return;

    try {
      await supabase.auth.signOut();

      window.localStorage.removeItem(
        "tttt_last_league_id"
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not sign out."
      );
    }
  }

  async function deleteMyAccount() {
    if (deleteAccountConfirmation !== "DELETE") {
      setAccountDeletionError(
        "Type DELETE exactly to confirm permanent account deletion."
      );
      return;
    }

    const confirmed = window.confirm(
      "Final confirmation: permanently delete your Table Talk account? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      setAccountDeleting(true);
      setAccountDeletionError("");

      const { data, error } = await supabase.functions.invoke(
        "delete-account",
        { body: { confirmation: "DELETE" } }
      );

      let failure = data;
      if (error?.context?.json) {
        try {
          failure = await error.context.json();
        } catch {
          // Keep the standard function error when there is no JSON response.
        }
      }

      if (error || !data?.deleted) {
        if (failure?.code === "owned_leagues") {
          const leagueNames = (failure.leagues || [])
            .map((ownedLeague) => ownedLeague.name)
            .join(", ");
          throw new Error(
            `Before deleting your account, transfer or permanently delete the leagues you own${
              leagueNames ? `: ${leagueNames}` : "."
            }`
          );
        }

        throw new Error(
          failure?.message ||
            error?.message ||
            "Your account could not be deleted."
        );
      }

      window.localStorage.removeItem("tttt_last_league_id");
      window.localStorage.removeItem("tttt_theme");

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // The server has already invalidated this deleted account.
      }

      window.location.reload();
    } catch (error) {
      console.error("Could not delete account", error);
      setAccountDeletionError(
        error.message ||
          "Your account could not be deleted. Contact support for help."
      );
    } finally {
      setAccountDeleting(false);
    }
  }

  async function createLeague(
    event
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setErrorMessage("");

      const cleanLeagueName =
        createLeagueName.trim();

      const cleanPlayerName =
        createName.trim() ||
        accountProfile?.display_name?.trim() ||
        "";

      const cleanCode =
        createLeagueCode
          .trim()
          .toUpperCase();

      if (!cleanLeagueName) {
        throw new Error(
          "Enter a league name."
        );
      }

      if (!cleanPlayerName) {
        throw new Error(
          "Enter your player name."
        );
      }

      if (!cleanCode) {
        throw new Error(
          "Create a league code."
        );
      }

      const {
        data: newLeagueId,
        error,
      } = await supabase.rpc(
        leagueAccessAvailable ? "create_league_v3" : "create_league_v2",
        leagueAccessAvailable
          ? {
              p_league_name: cleanLeagueName,
              p_join_code: cleanCode,
              p_player_name: cleanPlayerName,
              p_access_type: createAccessType,
            }
          : {
              p_league_name: cleanLeagueName,
              p_join_code: cleanCode,
              p_player_name: cleanPlayerName,
            }
      );

      if (error) throw error;

      setCreateLeagueName("");
      setCreateLeagueCode("");
      setCreateName("");
      setCreateAccessType("private");

      const list =
        await fetchMyLeagues();

      await fetchLeagueDirectory();

      const membership =
        list.find(
          (item) =>
            item.league_id ===
            newLeagueId
        );

      if (membership) {
        await syncAccountProfileToPlayer(
          membership.player_id
        );

        await openLeague(
          membership.league_id,
          user.id,
          list
        );
      }
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not create the league."
      );
    } finally {
      setSaving(false);
    }
  }

  async function joinLeague(
    event
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setErrorMessage("");

      const cleanName =
        joinName.trim() ||
        accountProfile?.display_name?.trim() ||
        "";

      const cleanCode =
        joinCode
          .trim()
          .toUpperCase();

      if (!cleanName) {
        throw new Error(
          "Enter your player name."
        );
      }

      if (!cleanCode) {
        throw new Error(
          "Enter the league code."
        );
      }

      const {
        data: joinResult,
        error,
      } = await supabase.rpc(
        leagueAccessAvailable
          ? "request_or_join_league_by_code"
          : "join_league_v2",
        {
          p_join_code:
            cleanCode,

          p_player_name:
            cleanName,
        }
      );

      if (error) throw error;

      const outcome = leagueAccessAvailable
        ? (Array.isArray(joinResult) ? joinResult[0] : joinResult)
        : null;

      if (outcome?.result === "pending") {
        setJoinCode("");
        setDirectoryMessage(
          "Your request is pending league admin approval."
        );
        setHubMode("list");
        await fetchLeagueDirectory();
        return;
      }

      const playerId = leagueAccessAvailable
        ? outcome?.player_id
        : joinResult;

      setJoinName("");
      setJoinCode("");

      const list =
        await fetchMyLeagues();

      const membership =
        list.find(
          (item) =>
            item.player_id ===
            playerId
        );

      if (membership) {
        await syncAccountProfileToPlayer(playerId);

        await openLeague(
          membership.league_id,
          user.id,
          list
        );
      }
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not join the league."
      );
    } finally {
      setSaving(false);
    }
  }

  async function joinDirectoryLeague(directoryLeague) {
    const playerName = accountProfile?.display_name?.trim() || "";

    if (!playerName) {
      setHubMode("profile");
      setErrorMessage("Add your player name before joining a league.");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setDirectoryMessage("");

      const { data, error } = await supabase.rpc("request_or_join_league", {
        p_league_id: directoryLeague.league_id,
        p_player_name: playerName,
      });

      if (error) throw error;

      const outcome = Array.isArray(data) ? data[0] : data;

      if (outcome?.result === "pending") {
        setDirectoryMessage(
          `Your request to join ${directoryLeague.league_name} is pending admin approval.`
        );
        await fetchLeagueDirectory();
        return;
      }

      const list = await fetchMyLeagues();
      await fetchLeagueDirectory();

      const membership = list.find(
        (item) => item.player_id === outcome?.player_id
      );

      if (membership) {
        await syncAccountProfileToPlayer(membership.player_id);
        await openLeague(membership.league_id, user.id, list);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Could not join that league.");
    } finally {
      setSaving(false);
    }
  }

  async function fetchPendingLeagueJoinRequests() {
    if (!leagueAccessAvailable || !league?.id || !isAdmin) {
      setPendingJoinRequests([]);
      return;
    }

    const { data, error } = await supabase.rpc(
      "get_pending_league_join_requests",
      { p_league_id: league.id }
    );

    if (error) throw error;
    setPendingJoinRequests(data || []);
  }

  async function reviewLeagueJoinRequest(requestId, approve) {
    try {
      setSaving(true);
      setErrorMessage("");
      const { error } = await supabase.rpc("review_league_join_request", {
        p_request_id: requestId,
        p_approve: approve,
      });
      if (error) throw error;
      await fetchPendingLeagueJoinRequests();
      await fetchLeagueDirectory();
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Could not review that request.");
    } finally {
      setSaving(false);
    }
  }

  async function changeLeagueAccessType(accessType) {
    try {
      setSaving(true);
      setErrorMessage("");
      const { error } = await supabase.rpc("update_league_access_type", {
        p_league_id: league.id,
        p_access_type: accessType,
      });
      if (error) throw error;
      await fetchLeagueDirectory();
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Could not update league access.");
    } finally {
      setSaving(false);
    }
  }

  async function sendLeagueInvitation(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setErrorMessage("");
      const { error } = await supabase.rpc("invite_to_league", {
        p_league_id: league.id,
        p_email: inviteEmail,
      });
      if (error) throw error;
      setInviteEmail("");
      setDirectoryMessage("Invitation ready. It will appear for that account.");
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Could not create that invitation.");
    } finally {
      setSaving(false);
    }
  }

  async function leaveLeague() {
    if (!league) return;

    const confirmed =
      window.confirm(
        `Leave "${league.name}"?\n\nYour match history and player record will stay in the league. If you rejoin later, the same profile will be restored.`
      );

    if (!confirmed) return;

    try {
      setSaving(true);

      const { error } =
        await supabase.rpc(
          "leave_league",
          {
            p_league_id:
              league.id,
          }
        );

      if (error) throw error;

      window.localStorage.removeItem(
        "tttt_last_league_id"
      );

      resetLeagueState();

      await fetchMyLeagues();

      setHubMode("list");
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not leave this league."
      );
    } finally {
      setSaving(false);
    }
  }

  function goToMyLeagues() {
    closeMobileHeaderMenu();
    resetLeagueState();
    setHubMode("list");
    setErrorMessage("");
    setDirectoryMessage("");

    fetchLeagueDirectory().catch((error) => {
      console.error(error);
      setErrorMessage(error.message || "Could not refresh available leagues.");
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  const leagueAnalytics = useMemo(
    () =>
      calculateLeagueAnalytics(
        players,
        matches
      ),
    [players, matches]
  );

  const standings =
    leagueAnalytics.standings;

  const activeStandings =
    leagueAnalytics.eloStandings.filter(
      (player) => player.is_active
    );


  const activePlayers =
    players.filter(
      (player) =>
        player.is_active
    );

  const removedPlayers =
    players.filter(
      (player) =>
        !player.is_active
    );

  const leader =
    activeStandings.find(
      (player) =>
        player.qualification === "ranked"
    ) ||
    activeStandings.find(
      (player) => player.matchesPlayed > 0
    ) ||
    null;

  const boardMatchActivity =
    useMemo(() => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const countSince = (days) =>
        matches.filter((match) => {
          const created = new Date(match.created_at).getTime();
          return created >= now - days * dayMs;
        }).length;

      return {
        today: matches.filter(
          (match) =>
            new Date(match.created_at).getTime() >=
            todayStart.getTime()
        ).length,
        last7: countSince(7),
        last30: countSince(30),
        latest: matches[0] || null,
      };
    }, [matches]);

  const isAdmin =
    currentPlayer?.member_role ===
      "admin" &&
    currentPlayer?.is_active;

  const currentLeagueDirectoryEntry = leagueDirectory.find(
    (item) => item.league_id === league?.id
  );

  const availableLeagueDirectory = leagueDirectory.filter(
    (item) => !item.is_member
  );

  const selectedPlayer =
    players.find(
      (player) =>
        player.id ===
        selectedPlayerId
    );

  const selectedStats =
    standings.find(
      (player) =>
        player.id ===
        selectedPlayerId
    );

  const selectedHistory =
    selectedPlayerId
      ? leagueAnalytics.playerHistory[
          selectedPlayerId
        ] || []
      : [];

  const selectedPerformanceHistory =
    useMemo(
      () =>
        filterHistoryByRange(
          selectedHistory,
          performanceRange
        ),
      [
        selectedHistory,
        performanceRange,
      ]
    );

  const selectedRangeStats =
    useMemo(() => {
      const history =
        selectedPerformanceHistory;

      const wins = history.filter(
        (item) => item.won
      ).length;
      const losses =
        history.length - wins;
      const pointsFor = history.reduce(
        (sum, item) =>
          sum + item.pointsFor,
        0
      );
      const pointsAgainst =
        history.reduce(
          (sum, item) =>
            sum + item.pointsAgainst,
          0
        );
      const totalPoints =
        pointsFor + pointsAgainst;
      const pointsWonPercentage =
        totalPoints === 0
          ? 0
          : Math.round(
              (pointsFor / totalPoints) *
                1000
            ) / 10;
      const ratingChange =
        history.reduce(
          (sum, item) =>
            sum + item.eloChange,
          0
        );
      const powerChange = ratingChange;
      const eloChange = history.reduce(
        (sum, item) =>
          sum + item.eloChange,
        0
      );

      return {
        matches: history.length,
        wins,
        losses,
        pointsFor,
        pointsAgainst,
        pointDifferential:
          pointsFor - pointsAgainst,
        pointsWonPercentage,
        powerChange,
        eloChange,
        ratingChange,
      };
    }, [selectedPerformanceHistory]);

  const selectedMatchAnalytics =
    selectedMatch
      ? leagueAnalytics.matchAnalytics[
          selectedMatch.id
        ] || null
      : null;

  const myMatches =
    useMemo(() => {
      if (!currentPlayer?.id) {
        return [];
      }

      return matches.filter(
        (match) =>
          match.player_a_id ===
            currentPlayer.id ||
          match.player_b_id ===
            currentPlayer.id
      );
    }, [
      matches,
      currentPlayer?.id,
    ]);

  const selectedRecentMatches =
    useMemo(() => {
      if (!selectedPlayerId) {
        return [];
      }

      return matches
        .filter(
          (match) =>
            match.player_a_id ===
              selectedPlayerId ||
            match.player_b_id ===
              selectedPlayerId
        )
        .slice(0, 5);
    }, [
      matches,
      selectedPlayerId,
    ]);

  const headToHead =
    useMemo(() => {
      if (!selectedPlayerId) {
        return [];
      }

      const records = {};

      matches.forEach(
        (match) => {
          const selectedIsA =
            match.player_a_id ===
            selectedPlayerId;

          const selectedIsB =
            match.player_b_id ===
            selectedPlayerId;

          if (
            !selectedIsA &&
            !selectedIsB
          ) {
            return;
          }

          const opponentId =
            selectedIsA
              ? match.player_b_id
              : match.player_a_id;

          if (!records[opponentId]) {
            records[opponentId] = {
              opponentId,
              wins: 0,
              losses: 0,
              matches: 0,
            };
          }

          const result =
            getMatchResult(match);

          records[
            opponentId
          ].matches++;

          if (
            result.winnerId ===
            selectedPlayerId
          ) {
            records[
              opponentId
            ].wins++;
          } else {
            records[
              opponentId
            ].losses++;
          }
        }
      );

      return Object.values(
        records
      ).sort(
        (a, b) =>
          b.matches -
          a.matches
      );
    }, [
      matches,
      selectedPlayerId,
    ]);

  function getPlayer(id) {
    return players.find(
      (player) =>
        player.id === id
    );
  }

  function getPlayerName(id) {
    return (
      getPlayer(id)?.name ||
      "Unknown"
    );
  }

  function getFormatName(
    matchFormat
  ) {
    if (Number(matchFormat) === 1) {
      return "Single Game";
    }

    if (Number(matchFormat) === 3) {
      return "Best of 3";
    }

    if (Number(matchFormat) === 5) {
      return "Best of 5";
    }

    return `Best of ${matchFormat}`;
  }

  function resetScores() {
    setGameScores([
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
    ]);
  }

  function updateGameScore(
    index,
    side,
    value
  ) {
    const updated = [
      ...gameScores,
    ];

    updated[index] = {
      ...updated[index],
      [side]: value,
    };

    setGameScores(updated);
  }

  function updateEditGameScore(
    index,
    side,
    value
  ) {
    const updated = [
      ...editGameScores,
    ];

    updated[index] = {
      ...updated[index],
      [side]: value,
    };

    setEditGameScores(updated);
  }

  useEffect(() => {
    if (
      activeTab === "record" &&
      recordMode === "mine" &&
      currentPlayer?.id
    ) {
      setPlayerA(currentPlayer.id);

      if (
        playerB === currentPlayer.id
      ) {
        setPlayerB("");
      }
    }
  }, [
    activeTab,
    recordMode,
    currentPlayer?.id,
    playerB,
  ]);

  function chooseRecordMode(mode) {
    setRecordMode(mode);
    setErrorMessage("");
    resetScores();

    if (mode === "mine") {
      setPlayerA(
        currentPlayer?.id || ""
      );
      setPlayerB("");
    } else {
      setPlayerA("");
      setPlayerB("");
    }
  }

  function showBoardDetail(mode) {
    const nextMode =
      boardDetailMode === mode ? null : mode;

    setBoardDetailMode(nextMode);

    if (nextMode) {
      window.setTimeout(() => {
        document
          .getElementById("board-detail-panel")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 60);
    }
  }

  function changeTab(tab) {
    closeMobileHeaderMenu();
    setErrorMessage("");
    setActiveTab(tab);

    if (tab === "chat") {
      setChatUnread(0);
      setChatOpenRequest((request) => request + 1);
    }

    if (tab === "record") {
      setRecordMode("mine");
      setPlayerA(
        currentPlayer?.id || ""
      );
      setPlayerB("");
      resetScores();
    }

    if (tab === "admin" && leagueAccessAvailable && isAdmin) {
      fetchPendingLeagueJoinRequests().catch((error) => {
        console.error(error);
        setErrorMessage(error.message || "Could not load pending join requests.");
      });
    }

    if (tab !== "leaderboard") {
      setBoardDetailMode(null);
    }

    if (tab !== "profile") {
      setSelectedPlayerId(null);
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openPlayerProfile(
    playerId
  ) {
    if (!playerId) return;

    setProfileReturnTab(
      activeTab === "profile"
        ? "players"
        : activeTab
    );

    setSelectedPlayerId(
      playerId
    );

    setPerformanceRange("all");

    setActiveTab(
      "profile"
    );

    setErrorMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openMyProfile() {
    if (!currentPlayer?.id) {
      return;
    }

    setProfileReturnTab(
      activeTab === "profile"
        ? "leaderboard"
        : activeTab
    );

    setSelectedPlayerId(
      currentPlayer.id
    );

    setPerformanceRange("all");

    setActiveTab(
      "profile"
    );

    setErrorMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function updateAvailability(
    status
  ) {
    if (!currentPlayer) {
      return;
    }

    try {
      setStatusUpdating(true);

      const { error } =
        await supabase.rpc(
          "update_my_player_profile_v2",
          {
            p_player_id:
              currentPlayer.id,

            p_description:
              currentPlayer.profile_description ||
              "",

            p_height_text:
              currentPlayer.height_text ||
              "",

            p_avg_ball_velocity:
              currentPlayer.avg_ball_velocity ??
              null,

            p_play_status:
              status,
          }
        );

      if (error) throw error;

      await loadLeagueData(
        league.id,
        user.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not update availability."
      );
    } finally {
      setStatusUpdating(false);
    }
  }

  async function saveMyProfile(
    event
  ) {
    event.preventDefault();

    if (!currentPlayer) {
      return;
    }

    let velocity = null;

    if (
      String(
        velocityDraft
      ).trim() !== ""
    ) {
      velocity =
        Number(velocityDraft);

      if (
        Number.isNaN(
          velocity
        )
      ) {
        alert(
          "Enter a valid ball velocity."
        );
        return;
      }
    }

    const cleanName =
      profileNameDraft.trim();

    if (!cleanName) {
      alert(
        "Your player name cannot be blank."
      );
      return;
    }

    try {
      setProfileSaving(true);

      if (
        cleanName !==
        currentPlayer.name
      ) {
        const {
          error:
            nameError,
        } =
          await supabase.rpc(
            "update_my_player_name",
            {
              p_player_id:
                currentPlayer.id,

              p_new_name:
                cleanName,
            }
          );

        if (nameError) {
          throw nameError;
        }
      }

      const { error } =
        await supabase.rpc(
          "update_my_player_profile_v2",
          {
            p_player_id:
              currentPlayer.id,

            p_description:
              profileDescriptionDraft,

            p_height_text:
              heightDraft,

            p_avg_ball_velocity:
              velocity,

            p_play_status:
              currentPlayer.play_status ||
              "idle",
          }
        );

      if (error) throw error;

      const { data: savedAccountProfile, error: accountError } =
        await supabase
          .from("account_profiles")
          .upsert(
            {
              user_id: user.id,
              display_name: cleanName,
              avatar_url:
                currentPlayer.avatar_url ||
                accountProfile?.avatar_url ||
                null,
              profile_description:
                profileDescriptionDraft,
              height_text: heightDraft,
              avg_ball_velocity: velocity,
              theme_preference: themeMode,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          )
          .select()
          .single();

      if (accountError) throw accountError;

      setAccountProfile(savedAccountProfile);
      setAccountNameDraft(cleanName);
      setAccountDescriptionDraft(profileDescriptionDraft);
      setAccountHeightDraft(heightDraft);
      setAccountVelocityDraft(velocity ?? "");

      await loadLeagueData(
        league.id,
        user.id
      );

      alert(
        "Profile saved."
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not save your profile."
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAvatarUpload(
    event
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (
      !file ||
      !user ||
      !league ||
      !currentPlayer
    ) {
      return;
    }

    try {
      setAvatarUploading(true);

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        throw new Error(
          "Please choose an image file."
        );
      }

      if (
        file.size >
        5 * 1024 * 1024
      ) {
        throw new Error(
          "Profile photos must be under 5 MB."
        );
      }

      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase() ||
        "jpg";

      const filePath = `${
        user.id
      }/${
        currentPlayer.id
      }/profile-${Date.now()}.${extension}`;

      const {
        error: uploadError,
      } = await supabase.storage
        .from(
          "player-avatars"
        )
        .upload(
          filePath,
          file,
          {
            cacheControl:
              "3600",
            upsert: false,
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: publicUrlData,
      } = supabase.storage
        .from(
          "player-avatars"
        )
        .getPublicUrl(
          filePath
        );

      const {
        error: profileError,
      } = await supabase.rpc(
        "update_my_avatar_v2",
        {
          p_player_id:
            currentPlayer.id,

          p_avatar_url:
            publicUrlData.publicUrl,
        }
      );

      if (profileError) {
        throw profileError;
      }

      const { data: savedAccountProfile, error: accountError } =
        await supabase
          .from("account_profiles")
          .upsert(
            {
              user_id: user.id,
              display_name:
                profileNameDraft.trim() ||
                currentPlayer.name,
              avatar_url: publicUrlData.publicUrl,
              profile_description:
                profileDescriptionDraft,
              height_text: heightDraft,
              avg_ball_velocity:
                String(velocityDraft).trim() === ""
                  ? null
                  : Number(velocityDraft),
              theme_preference: themeMode,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          )
          .select()
          .single();

      if (accountError) throw accountError;
      setAccountProfile(savedAccountProfile);

      await loadLeagueData(
        league.id,
        user.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not upload your profile photo."
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  async function updateLeagueProfile(
    values = {}
  ) {
    if (!league) return;

    const {
      description =
        leagueDescriptionDraft,

      logo_url =
        league.logo_url ||
        "",

      logo_path =
        league.logo_path ||
        "",

      banner_url =
        league.banner_url ||
        "",

      banner_path =
        league.banner_path ||
        "",
    } = values;

    const { error } =
      await supabase.rpc(
        "admin_update_league_profile",
        {
          p_league_id:
            league.id,

          p_description:
            description || "",

          p_logo_url:
            logo_url || "",

          p_logo_path:
            logo_path || "",

          p_banner_url:
            banner_url || "",

          p_banner_path:
            banner_path || "",
        }
      );

    if (error) throw error;
  }

  async function saveLeagueDescription() {
    try {
      setSaving(true);

      await updateLeagueProfile({
        description:
          leagueDescriptionDraft,
      });

      await loadLeagueData(
        league.id,
        user?.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not save the league description."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadLeagueAsset(
    event,
    type
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (
      !file ||
      !league ||
      !isAdmin
    ) {
      return;
    }

    const setUploading =
      type === "logo"
        ? setLogoUploading
        : setBannerUploading;

    try {
      setUploading(true);

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        throw new Error(
          "Please choose an image file."
        );
      }

      if (
        file.size >
        8 * 1024 * 1024
      ) {
        throw new Error(
          "League images must be under 8 MB."
        );
      }

      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase() ||
        "jpg";

      const filePath = `${
        league.id
      }/${type}-${Date.now()}.${extension}`;

      const {
        error: uploadError,
      } = await supabase.storage
        .from(
          "league-assets"
        )
        .upload(
          filePath,
          file,
          {
            cacheControl:
              "3600",
            upsert: false,
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: publicUrlData,
      } = supabase.storage
        .from(
          "league-assets"
        )
        .getPublicUrl(
          filePath
        );

      const newUrl =
        publicUrlData.publicUrl;

      const oldPath =
        type === "logo"
          ? league.logo_path
          : league.banner_path;

      if (type === "logo") {
        await updateLeagueProfile({
          logo_url: newUrl,
          logo_path: filePath,
        });
      } else {
        await updateLeagueProfile({
          banner_url: newUrl,
          banner_path: filePath,
        });
      }

      if (oldPath) {
        await supabase.storage
          .from(
            "league-assets"
          )
          .remove([
            oldPath,
          ]);
      }

      await loadLeagueData(
        league.id,
        user?.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not upload the league image."
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeLeagueAsset(
    type
  ) {
    if (!league) return;

    const path =
      type === "logo"
        ? league.logo_path
        : league.banner_path;

    try {
      if (path) {
        const {
          error:
            removeError,
        } =
          await supabase.storage
            .from(
              "league-assets"
            )
            .remove([
              path,
            ]);

        if (removeError) {
          throw removeError;
        }
      }

      if (type === "logo") {
        await updateLeagueProfile({
          logo_url: "",
          logo_path: "",
        });
      } else {
        await updateLeagueProfile({
          banner_url: "",
          banner_path: "",
        });
      }

      await loadLeagueData(
        league.id,
        user?.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not remove the league image."
      );
    }
  }

  async function recordMatch(
    event
  ) {
    event.preventDefault();

    if (!league || !user) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");

      if (!playerA || !playerB) {
        throw new Error(
          "Choose both players."
        );
      }

      if (
        playerA === playerB
      ) {
        throw new Error(
          "A player cannot play themselves."
        );
      }

      const usableGames =
        validateMatchScores(
          format,
          gameScores
        );

      const { error } =
        await supabase
          .from("matches")
          .insert({
            league_id:
              league.id,

            player_a_id:
              playerA,

            player_b_id:
              playerB,

            format,

            games:
              usableGames,

            created_by:
              user.id,
          });

      if (error) throw error;

      setPlayerA(
        recordMode === "mine"
          ? currentPlayer?.id || ""
          : ""
      );
      setPlayerB("");

      resetScores();

      await loadLeagueData(
        league.id,
        user.id
      );

      setActiveTab(
        "leaderboard"
      );
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not save the match."
      );
    } finally {
      setSaving(false);
    }
  }

  function canManageMatch(
    match
  ) {
    if (
      !match ||
      !currentPlayer ||
      !user
    ) {
      return false;
    }

    return (
      isAdmin ||
      match.created_by ===
        user.id ||
      match.player_a_id ===
        currentPlayer.id ||
      match.player_b_id ===
        currentPlayer.id
    );
  }

  function openEditMatch(
    match
  ) {
    const rows = [
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
    ];

    const games =
      Array.isArray(match.games)
        ? match.games
        : [];

    games.forEach(
      (game, index) => {
        if (index < 5) {
          rows[index] = {
            a: String(game.a),
            b: String(game.b),
          };
        }
      }
    );

    setEditingMatch(match);
    setEditFormat(
      Number(match.format)
    );
    setEditGameScores(rows);
  }

  async function saveEditedMatch(
    event
  ) {
    event.preventDefault();

    if (!editingMatch) return;

    try {
      setSaving(true);

      const usableGames =
        validateMatchScores(
          editFormat,
          editGameScores
        );

      const { error } =
        await supabase.rpc(
          "edit_match",
          {
            p_match_id:
              editingMatch.id,

            p_format:
              editFormat,

            p_games:
              usableGames,
          }
        );

      if (error) throw error;

      setEditingMatch(null);

      await loadLeagueData(
        league.id,
        user.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not update this match."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteMatch(
    matchId
  ) {
    const confirmed =
      window.confirm(
        "Delete this entire match? It will be removed from the league and all rankings will be recalculated."
      );

    if (!confirmed) return;

    try {
      const { error } =
        await supabase.rpc(
          "delete_match_v2",
          {
            p_match_id:
              matchId,
          }
        );

      if (error) throw error;

      if (
        editingMatch?.id ===
        matchId
      ) {
        setEditingMatch(null);
      }

      await loadLeagueData(
        league.id,
        user?.id
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not delete this match."
      );
    }
  }

  async function renamePlayer(
    player
  ) {
    const newName =
      window.prompt(
        "Enter the player's new name:",
        player.name
      );

    if (
      newName === null
    ) {
      return;
    }

    const cleanName =
      newName.trim();

    if (
      !cleanName ||
      cleanName ===
        player.name
    ) {
      return;
    }

    try {
      const { error } =
        await supabase.rpc(
          "admin_rename_player_v2",
          {
            p_player_id:
              player.id,

            p_new_name:
              cleanName,
          }
        );

      if (error) throw error;

      await loadLeagueData(
        league.id,
        user?.id
      );
    } catch (error) {
      alert(
        error.message ||
          "Could not rename player."
      );
    }
  }

  async function removePlayer(
    player
  ) {
    const confirmed =
      window.confirm(
        `Remove ${player.name} from the active league?\n\nTheir player profile and match history will NOT be deleted.`
      );

    if (!confirmed) return;

    try {
      const { error } =
        await supabase.rpc(
          "admin_remove_player_v2",
          {
            p_player_id:
              player.id,
          }
        );

      if (error) throw error;

      await loadLeagueData(
        league.id,
        user?.id
      );
    } catch (error) {
      alert(
        error.message ||
          "Could not remove player."
      );
    }
  }

  async function restorePlayer(
    player
  ) {
    try {
      const { error } =
        await supabase.rpc(
          "admin_restore_player_v2",
          {
            p_player_id:
              player.id,
          }
        );

      if (error) throw error;

      await loadLeagueData(
        league.id,
        user?.id
      );
    } catch (error) {
      alert(
        error.message ||
          "Could not restore player."
      );
    }
  }

  async function changePlayerRole(
    player
  ) {
    const newRole =
      player.member_role ===
      "admin"
        ? "player"
        : "admin";

    const confirmed =
      window.confirm(
        newRole === "admin"
          ? `Make ${player.name} a league admin?`
          : `Remove admin privileges from ${player.name}?`
      );

    if (!confirmed) return;

    try {
      const { error } =
        await supabase.rpc(
          "admin_set_player_role",
          {
            p_player_id:
              player.id,

            p_role:
              newRole,
          }
        );

      if (error) throw error;

      await loadLeagueData(
        league.id,
        user?.id
      );

      await fetchMyLeagues();
    } catch (error) {
      alert(
        error.message ||
          "Could not change player role."
      );
    }
  }

  async function deleteLeague() {
    if (
      !league ||
      !isAdmin
    ) {
      return;
    }

    const typed =
      window.prompt(
        `This permanently deletes "${league.name}", every player membership, and every match.\n\nType the exact league name to confirm:`
      );

    if (
      typed !== league.name
    ) {
      if (typed !== null) {
        alert(
          "League name did not match. Nothing was deleted."
        );
      }

      return;
    }

    const secondConfirmation =
      window.confirm(
        "Final confirmation: permanently delete this entire league?"
      );

    if (!secondConfirmation) {
      return;
    }

    try {
      setSaving(true);

      const paths = [
        league.logo_path,
        league.banner_path,
      ].filter(Boolean);

      if (
        paths.length >
        0
      ) {
        const {
          error:
            storageError,
        } =
          await supabase.storage
            .from(
              "league-assets"
            )
            .remove(paths);

        if (storageError) {
          throw storageError;
        }
      }

      const { error } =
        await supabase.rpc(
          "admin_delete_league",
          {
            p_league_id:
              league.id,
          }
        );

      if (error) throw error;

      window.localStorage.removeItem(
        "tttt_last_league_id"
      );

      resetLeagueState();

      await fetchMyLeagues();

      setHubMode("list");

      alert(
        "League deleted."
      );
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Could not delete the league."
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyLeagueCode() {
    closeMobileHeaderMenu();

    if (
      !league?.join_code
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        league.join_code
      );

      alert(
        `League code ${league.join_code} copied!`
      );
    } catch {
      alert(
        `League code: ${league.join_code}`
      );
    }
  }

  function renderMatchCard(
    match,
    showManage = true
  ) {
    const result = getMatchResult(match);
    const canManage =
      showManage && canManageMatch(match);
    const playerAClass =
      result.winnerId === match.player_a_id
        ? "match-winner-name"
        : "match-loser-name";
    const playerBClass =
      result.winnerId === match.player_b_id
        ? "match-winner-name"
        : "match-loser-name";

    return (
      <div
        className="match-item match-item-clickable"
        key={match.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedMatch(match)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            setSelectedMatch(match);
          }
        }}
      >
        <div className="match-main-copy">
          <small>
            {new Date(
              match.created_at
            ).toLocaleString()} {" "}
            • {" "}
            {getFormatName(match.format)}
          </small>

          <h3 className="history-player-line">
            <button
              className={playerAClass}
              onClick={(event) => {
                event.stopPropagation();
                openPlayerProfile(
                  match.player_a_id
                );
              }}
            >
              {getPlayerName(
                match.player_a_id
              )}
            </button>

            <strong className={playerAClass}>
              {result.aWins}
            </strong>

            <span>–</span>

            <strong className={playerBClass}>
              {result.bWins}
            </strong>

            <button
              className={playerBClass}
              onClick={(event) => {
                event.stopPropagation();
                openPlayerProfile(
                  match.player_b_id
                );
              }}
            >
              {getPlayerName(
                match.player_b_id
              )}
            </button>
          </h3>

          <div className="game-results">
            {(match.games || []).map(
              (game, index) => (
                <span key={index}>
                  G{index + 1}: {game.a}-{game.b}
                </span>
              )
            )}
          </div>

          <div className="match-detail-hint">
            View match details →
          </div>
        </div>

        {canManage && (
          <div
            className="match-actions"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="edit-button"
              onClick={() => openEditMatch(match)}
            >
              Edit Match
            </button>

            <button
              className="delete-button"
              onClick={() =>
                deleteMatch(match.id)
              }
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <img src={tableTalkAppIcon} alt="Table Talk Table Tennis" />
        </div>

        <h1>
          Table Talk Table Tennis
        </h1>

        <p>
          Loading...
        </p>
      </div>
    );
  }

  if (legalPage) {
    return (
      <Suspense
        fallback={
          <div className="loading-screen">
            <div className="loading-logo">
              <img src={tableTalkAppIcon} alt="Table Talk Table Tennis" />
            </div>
            <p>Loading policy…</p>
          </div>
        }
      >
        <LegalCenter
          page={legalPage}
          supportEmail={SUPPORT_EMAIL}
          onNavigate={openLegalPage}
          onClose={closeLegalPage}
        />
      </Suspense>
    );
  }

  if (
    authMode === "reset"
  ) {
    return (
      <div className="auth-page">
        <div className="auth-shell">
          <div className="auth-brand">
            <BrandMark className="auth-icon" />

            <h1>
              Table Talk Table Tennis
            </h1>

            <p>
              Reset your password
            </p>
          </div>

          <div className="auth-card">
            <h2>
              Choose a New Password
            </h2>

            <p className="auth-card-copy">
              Enter a new password for your TTTT account.
            </p>

            <form
              onSubmit={
                handleResetPassword
              }
            >
              <label>
                New Password
              </label>

              <input
                type="password"
                autoComplete="new-password"
                value={
                  newPassword
                }
                onChange={(e) =>
                  setNewPassword(
                    e.target
                      .value
                  )
                }
                placeholder="At least 8 characters"
              />

              <label>
                Confirm New Password
              </label>

              <input
                type="password"
                autoComplete="new-password"
                value={
                  confirmNewPassword
                }
                onChange={(e) =>
                  setConfirmNewPassword(
                    e.target
                      .value
                  )
                }
                placeholder="Enter it again"
              />

              {authError && (
                <div className="error-message">
                  {
                    authError
                  }
                </div>
              )}

              {authMessage && (
                <div className="success-message">
                  {
                    authMessage
                  }
                </div>
              )}

              <button
                className="primary-button big-button"
                disabled={
                  authLoading
                }
              >
                {authLoading
                  ? "Updating..."
                  : "Update Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-shell">
          <div className="auth-brand">
            <BrandMark className="auth-icon" />

            <h1>
              Table Talk Table Tennis
            </h1>

            <p>
              Your table tennis leagues. One account.
            </p>
          </div>

          <div className="auth-card">
            <div className="auth-tabs">
              <button
                className={
                  authMode ===
                  "login"
                    ? "auth-tab-active"
                    : ""
                }
                onClick={() => {
                  setAuthMode(
                    "login"
                  );
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Log In
              </button>

              <button
                className={
                  authMode ===
                  "signup"
                    ? "auth-tab-active"
                    : ""
                }
                onClick={() => {
                  setAuthMode(
                    "signup"
                  );
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Create Account
              </button>
            </div>

            {authMode ===
              "login" && (
              <form
                onSubmit={
                  handleLogin
                }
              >
                <h2>
                  Welcome Back
                </h2>

                <p className="auth-card-copy">
                  Log in and your leagues will still be here.
                </p>

                <label>
                  Email
                </label>

                <input
                  type="email"
                  autoComplete="email"
                  value={
                    authEmail
                  }
                  onChange={(e) =>
                    setAuthEmail(
                      e.target
                        .value
                    )
                  }
                  placeholder="you@example.com"
                />

                <label>
                  Password
                </label>

                <input
                  type="password"
                  autoComplete="current-password"
                  value={
                    authPassword
                  }
                  onChange={(e) =>
                    setAuthPassword(
                      e.target
                        .value
                    )
                  }
                  placeholder="Your password"
                />

                <button
                  type="button"
                  className="forgot-link"
                  onClick={() => {
                    setAuthMode(
                      "forgot"
                    );
                    setAuthError("");
                    setAuthMessage("");
                  }}
                >
                  Forgot password?
                </button>

                {authError && (
                  <div className="error-message">
                    {
                      authError
                    }
                  </div>
                )}

                {authMessage && (
                  <div className="success-message">
                    {
                      authMessage
                    }
                  </div>
                )}

                <button
                  className="primary-button big-button"
                  disabled={
                    authLoading
                  }
                >
                  {authLoading
                    ? "Logging In..."
                    : "Log In"}
                </button>
              </form>
            )}

            {authMode ===
              "signup" && (
              <form
                onSubmit={
                  handleSignup
                }
              >
                <h2>
                  Create Your Account
                </h2>

                <p className="auth-card-copy">
                  Your email is used only for your private account login and recovery. It is not shown on your player profile.
                </p>

                <label>
                  Email
                </label>

                <input
                  type="email"
                  autoComplete="email"
                  value={
                    authEmail
                  }
                  onChange={(e) =>
                    setAuthEmail(
                      e.target
                        .value
                    )
                  }
                  placeholder="you@example.com"
                />

                <label>
                  Password
                </label>

                <input
                  type="password"
                  autoComplete="new-password"
                  value={
                    authPassword
                  }
                  onChange={(e) =>
                    setAuthPassword(
                      e.target
                        .value
                    )
                  }
                  placeholder="At least 8 characters"
                />

                <label>
                  Confirm Password
                </label>

                <input
                  type="password"
                  autoComplete="new-password"
                  value={
                    authConfirmPassword
                  }
                  onChange={(e) =>
                    setAuthConfirmPassword(
                      e.target
                        .value
                    )
                  }
                  placeholder="Enter it again"
                />

                {authError && (
                  <div className="error-message">
                    {
                      authError
                    }
                  </div>
                )}

                {authMessage && (
                  <div className="success-message">
                    {
                      authMessage
                    }
                  </div>
                )}

                <button
                  className="primary-button big-button"
                  disabled={
                    authLoading
                  }
                >
                  {authLoading
                    ? "Creating..."
                    : "Create Account"}
                </button>

                <p className="auth-terms-copy">
                  By creating an account, you agree to our{" "}
                  <button type="button" onClick={() => openLegalPage("terms")}>
                    Terms of Use
                  </button>{" "}
                  and{" "}
                  <button type="button" onClick={() => openLegalPage("community")}>
                    Community Guidelines
                  </button>
                  .
                </p>
              </form>
            )}

            {authMode ===
              "forgot" && (
              <form
                onSubmit={
                  handleForgotPassword
                }
              >
                <button
                  type="button"
                  className="back-auth-link"
                  onClick={() => {
                    setAuthMode(
                      "login"
                    );
                    setAuthError("");
                    setAuthMessage("");
                  }}
                >
                  ← Back to Log In
                </button>

                <h2>
                  Forgot Password
                </h2>

                <p className="auth-card-copy">
                  Enter the email connected to your TTTT account and we will send you a reset link.
                </p>

                <label>
                  Email
                </label>

                <input
                  type="email"
                  autoComplete="email"
                  value={
                    authEmail
                  }
                  onChange={(e) =>
                    setAuthEmail(
                      e.target
                        .value
                    )
                  }
                  placeholder="you@example.com"
                />

                {authError && (
                  <div className="error-message">
                    {
                      authError
                    }
                  </div>
                )}

                {authMessage && (
                  <div className="success-message">
                    {
                      authMessage
                    }
                  </div>
                )}

                <button
                  className="primary-button big-button"
                  disabled={
                    authLoading
                  }
                >
                  {authLoading
                    ? "Sending..."
                    : "Send Reset Email"}
                </button>
              </form>
            )}
          </div>

          <LegalLinks onNavigate={openLegalPage} />
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="league-hub-page">
        <header className="hub-header">
          <div className="hub-header-inner">
            <div className="brand-area">
              <BrandMark className="brand-icon" />

              <div>
                <h1>
                  Table Talk Table Tennis
                </h1>

                <p>
                  My Leagues
                </p>
              </div>
            </div>

            <button
              className="sign-out-button"
              onClick={
                signOut
              }
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="hub-main">
          <div className="hub-heading-row">
            <div>
              <p className="season-label">
                YOUR ACCOUNT
              </p>

              <h2>
                My Leagues
              </h2>

              <p>
                Open one of your leagues or join another.
              </p>
            </div>

            <div className="hub-action-buttons">
              <button
                className="secondary-button"
                onClick={() => {
                  setHubMode("profile");
                  setErrorMessage("");
                }}
              >
                <AppIcon name="user" size={16} />
                My Profile
              </button>

              <button
                className="secondary-button"
                onClick={() => {
                  setHubMode(
                    "join"
                  );
                  setErrorMessage("");
                }}
              >
                + Join League
              </button>

              <button
                className="primary-button"
                onClick={() => {
                  setHubMode(
                    "create"
                  );
                  setErrorMessage("");
                }}
              >
                + Create League
              </button>
            </div>
          </div>

          {hubMode ===
            "list" && (
            <>
              {memberships.length >
              0 ? (
                <div className="league-card-grid">
                  {memberships.map(
                    (
                      membership
                    ) => (
                      <button
                        className="league-hub-card"
                        key={
                          membership.league_id
                        }
                        onClick={() =>
                          openLeague(
                            membership.league_id,
                            user.id,
                            memberships
                          )
                        }
                      >
                        <div className="league-hub-card-top">
                          {membership.logo_url ? (
                            <img
                              className="hub-league-logo"
                              src={
                                membership.logo_url
                              }
                              alt=""
                            />
                          ) : (
                            <div className="hub-league-fallback">
                              <AppIcon name="paddle" size={28} />
                            </div>
                          )}

                          <div className="league-role-pill">
                            {membership.member_role ===
                            "admin"
                              ? "Admin"
                              : "Player"}
                          </div>
                        </div>

                        <h3>
                          {
                            membership.league_name
                          }
                        </h3>

                        {membership.league_description && (
                          <p>
                            {
                              membership.league_description
                            }
                          </p>
                        )}

                        <div className="hub-code">
                          League Code:{" "}
                          <strong>
                            {
                              membership.join_code
                            }
                          </strong>
                        </div>

                        <div className="open-league-label">
                          Open League →
                        </div>
                      </button>
                    )
                  )}
                </div>
              ) : (
                <div className="empty-leagues-card">
                  <div className="empty-leagues-icon">
                    <AppIcon name="paddle" size={42} />
                  </div>

                  <h3>
                    No leagues connected yet
                  </h3>

                  <p>
                    Join an existing league or create a new one.
                  </p>

                  <div className="empty-league-actions">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setHubMode(
                          "join"
                        )
                      }
                    >
                      Join League
                    </button>

                    <button
                      className="primary-button"
                      onClick={() =>
                        setHubMode(
                          "create"
                        )
                      }
                    >
                      Create League
                    </button>
                  </div>
                </div>
              )}

              {leagueAccessAvailable && (
                <section className="league-directory-section">
                  <div className="league-directory-heading">
                    <div>
                      <p className="season-label">DISCOVER</p>
                      <h2>Available Leagues</h2>
                    </div>
                    <p>Public leagues join instantly. Private leagues require admin approval.</p>
                  </div>

                  {availableLeagueDirectory.length > 0 ? (
                    <div className="league-directory-grid">
                      {availableLeagueDirectory.map((directoryLeague) => {
                        const isPending = directoryLeague.request_status === "pending";
                        const isApproved = directoryLeague.request_status === "approved";
                        const isLocked =
                          directoryLeague.access_type === "invite_only" &&
                          !directoryLeague.has_invitation;
                        const accessLabel =
                          directoryLeague.access_type === "public"
                            ? "Public"
                            : directoryLeague.access_type === "private"
                              ? "Private"
                              : "Invite only";

                        return (
                          <article
                            className="league-directory-card"
                            key={directoryLeague.league_id}
                          >
                            <div className="league-directory-card-top">
                              {directoryLeague.logo_url ? (
                                <img
                                  className="hub-league-logo"
                                  src={directoryLeague.logo_url}
                                  alt=""
                                />
                              ) : (
                                <div className="hub-league-fallback">
                                  <AppIcon name="paddle" size={28} />
                                </div>
                              )}
                              <span
                                className={`league-access-pill league-access-${directoryLeague.access_type}`}
                              >
                                {isLocked && <AppIcon name="lock" size={13} />}
                                {accessLabel}
                              </span>
                            </div>

                            <h3>{directoryLeague.league_name}</h3>
                            {directoryLeague.league_description && (
                              <p>{directoryLeague.league_description}</p>
                            )}
                            <small>
                              {directoryLeague.active_player_count || 0} active players
                            </small>

                            <button
                              type="button"
                              className="primary-button"
                              disabled={saving || isPending || isLocked}
                              onClick={() => joinDirectoryLeague(directoryLeague)}
                            >
                              {isPending
                                ? "Pending"
                                : isApproved
                                  ? "Approved — Join"
                                  : isLocked
                                    ? "Invitation Required"
                                    : directoryLeague.has_invitation
                                      ? "Accept Invitation"
                                      : directoryLeague.access_type === "private"
                                        ? "Request to Join"
                                        : "Join"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="league-directory-empty">
                      No other leagues are available yet.
                    </div>
                  )}
                </section>
              )}

              {directoryMessage && (
                <div className="success-message">{directoryMessage}</div>
              )}

              {errorMessage && (
                <div className="error-message">
                  {
                    errorMessage
                  }
                </div>
              )}
            </>
          )}

          {hubMode ===
            "join" && (
            <div className="hub-form-card">
              <button
                className="back-button"
                onClick={() => {
                  setHubMode(
                    "list"
                  );
                  setErrorMessage("");
                }}
              >
                ← My Leagues
              </button>

              <h2>
                Join a League
              </h2>

              <p>
                You can belong to multiple TTTT leagues with the same account.
              </p>

              <form
                onSubmit={
                  joinLeague
                }
              >
                <label>
                  Your Player Name
                </label>

                <input
                  value={
                    joinName
                  }
                  onChange={(e) =>
                    setJoinName(
                      e.target
                        .value
                    )
                  }
                  placeholder="Enter your name"
                />

                <label>
                  League Code
                </label>

                <input
                  value={
                    joinCode
                  }
                  onChange={(e) =>
                    setJoinCode(
                      e.target.value.toUpperCase()
                    )
                  }
                  placeholder="Enter league code"
                />

                <p className="form-help">
                  Player names must be unique inside each league.
                </p>

                {errorMessage && (
                  <div className="error-message">
                    {
                      errorMessage
                    }
                  </div>
                )}

                <button
                  className="primary-button big-button"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Joining..."
                    : "Join League"}
                </button>
              </form>
            </div>
          )}

          {hubMode ===
            "create" && (
            <div className="hub-form-card">
              <button
                className="back-button"
                onClick={() => {
                  setHubMode(
                    "list"
                  );
                  setErrorMessage("");
                }}
              >
                ← My Leagues
              </button>

              <h2>
                Create a League
              </h2>

              <form
                onSubmit={
                  createLeague
                }
              >
                <label>
                  League Name
                </label>

                <input
                  value={
                    createLeagueName
                  }
                  onChange={(e) =>
                    setCreateLeagueName(
                      e.target
                        .value
                    )
                  }
                  placeholder="My Table Tennis League"
                />

                <label>
                  Your Player Name
                </label>

                <input
                  value={
                    createName
                  }
                  onChange={(e) =>
                    setCreateName(
                      e.target
                        .value
                    )
                  }
                  placeholder="Enter your name"
                />

                <label>
                  League Code
                </label>

                <input
                  value={
                    createLeagueCode
                  }
                  onChange={(e) =>
                    setCreateLeagueCode(
                      e.target.value.toUpperCase()
                    )
                  }
                  placeholder="Create a league code"
                />

                {leagueAccessAvailable && (
                  <fieldset className="league-access-picker">
                    <legend>Who can join?</legend>

                    {[
                      {
                        value: "public",
                        title: "Public",
                        copy: "Anyone can join immediately.",
                      },
                      {
                        value: "private",
                        title: "Private",
                        copy: "An admin approves each request.",
                      },
                      {
                        value: "invite_only",
                        title: "Invite only",
                        copy: "Only invited people can join.",
                      },
                    ].map((option) => (
                      <label
                        className={
                          createAccessType === option.value
                            ? "league-access-option league-access-option-active"
                            : "league-access-option"
                        }
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name="league-access"
                          value={option.value}
                          checked={createAccessType === option.value}
                          onChange={(event) =>
                            setCreateAccessType(event.target.value)
                          }
                        />
                        <span>
                          <strong>{option.title}</strong>
                          <small>{option.copy}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}

                {errorMessage && (
                  <div className="error-message">
                    {
                      errorMessage
                  }
                  </div>
                )}

                <button
                  className="primary-button big-button"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Creating..."
                    : "Create League"}
                </button>
              </form>
            </div>
          )}

          {hubMode === "profile" && (
            <div className="hub-form-card account-profile-hub-card">
              <button
                className="back-button"
                onClick={() => {
                  setHubMode("list");
                  setErrorMessage("");
                }}
              >
                ← My Leagues
              </button>

              <div className="account-profile-hub-heading">
                <div>
                  <p className="season-label">MY ACCOUNT</p>
                  <h2>My Profile</h2>
                  <p>
                    Set up your player profile before you join a league. These details become your defaults when you join or create one.
                  </p>
                </div>

                <PlayerAvatar
                  player={{
                    name:
                      accountNameDraft ||
                      accountProfile?.display_name ||
                      "Player",
                    avatar_url:
                      accountProfile?.avatar_url || null,
                  }}
                  size="xlarge"
                />
              </div>

              <div className="account-profile-photo-row">
                <label className="avatar-upload-button">
                  {accountAvatarUploading
                    ? "Uploading..."
                    : accountProfile?.avatar_url
                    ? "Change Photo"
                    : "Add Photo"}

                  <input
                    className="avatar-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleAccountAvatarUpload}
                    disabled={accountAvatarUploading}
                  />
                </label>
              </div>

              <form onSubmit={saveAccountProfile}>
                <label>Display Name</label>
                <input
                  value={accountNameDraft}
                  onChange={(e) =>
                    setAccountNameDraft(e.target.value)
                  }
                  maxLength="80"
                  placeholder="Your player name"
                />

                <label>Player Description</label>
                <textarea
                  rows="4"
                  maxLength="500"
                  value={accountDescriptionDraft}
                  onChange={(e) =>
                    setAccountDescriptionDraft(
                      e.target.value
                    )
                  }
                  placeholder="Tell the league a little about yourself or your playing style..."
                />

                <div className="profile-edit-grid">
                  <div>
                    <label>Height</label>
                    <input
                      type="text"
                      maxLength="30"
                      value={accountHeightDraft}
                      onChange={(e) =>
                        setAccountHeightDraft(
                          e.target.value
                        )
                      }
                      placeholder={`6'1"`}
                    />
                  </div>

                  <div>
                    <label>Average Ball Velocity</label>
                    <div className="velocity-input">
                      <input
                        type="number"
                        min="0"
                        max="500"
                        step="0.1"
                        value={accountVelocityDraft}
                        onChange={(e) =>
                          setAccountVelocityDraft(
                            e.target.value
                          )
                        }
                        placeholder="63.7"
                      />
                      <span>MPH</span>
                    </div>
                  </div>
                </div>

                <p className="velocity-disclaimer">
                  Ball velocity is self-reported and has undergone absolutely no independent verification.
                </p>

                <button
                  className="primary-button big-button"
                  disabled={accountProfileSaving}
                >
                  {accountProfileSaving
                    ? "Saving..."
                    : "Save Profile"}
                </button>
              </form>

              <div className="display-settings-card">
                <div>
                  <p className="season-label">DISPLAY</p>
                  <h3>Appearance</h3>
                  <p>Choose how Table Talk looks on this account.</p>
                </div>
                <ThemeControl
                  theme={themeMode}
                  onChange={updateThemePreference}
                  saving={themeSaving}
                />
              </div>

              <div className="account-hub-security">
                <button
                  className="secondary-button"
                  onClick={sendMyPasswordReset}
                  disabled={saving}
                >
                  Send Password Reset Email
                </button>
              </div>

              <div className="account-legal-card">
                <div>
                  <p className="season-label">SAFETY & LEGAL</p>
                  <h3>Policies and Support</h3>
                  <p>
                    Review your privacy choices, community rules, or contact
                    Table Talk Support.
                  </p>
                </div>
                <LegalLinks onNavigate={openLegalPage} />
              </div>

              <div className="account-deletion-card">
                <div>
                  <p className="season-label">DANGER ZONE</p>
                  <h3>Delete Account</h3>
                  <p>
                    Permanently remove your login, profile, messages, table
                    submissions, ratings, and uploaded account photos. Match
                    history keeps an anonymous “Deleted Player” entry so league
                    records remain accurate.
                  </p>
                </div>

                {!showDeleteAccount ? (
                  <button
                    type="button"
                    className="danger-outline-button"
                    onClick={() => {
                      setShowDeleteAccount(true);
                      setAccountDeletionError("");
                    }}
                  >
                    Delete My Account
                  </button>
                ) : (
                  <div className="account-deletion-confirmation">
                    <p>
                      This cannot be undone. If you own a league, transfer its
                      ownership or delete the league first.
                    </p>
                    <label htmlFor="delete-account-confirmation">
                      Type <strong>DELETE</strong> to confirm
                    </label>
                    <input
                      id="delete-account-confirmation"
                      value={deleteAccountConfirmation}
                      onChange={(event) => {
                        setDeleteAccountConfirmation(event.target.value);
                        setAccountDeletionError("");
                      }}
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck="false"
                      disabled={accountDeleting}
                    />

                    {accountDeletionError && (
                      <div className="error-message">
                        {accountDeletionError}
                      </div>
                    )}

                    <div className="account-deletion-actions">
                      <button
                        type="button"
                        className="delete-account-button"
                        onClick={deleteMyAccount}
                        disabled={
                          accountDeleting ||
                          deleteAccountConfirmation !== "DELETE"
                        }
                      >
                        {accountDeleting
                          ? "Deleting Account…"
                          : "Permanently Delete Account"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setShowDeleteAccount(false);
                          setDeleteAccountConfirmation("");
                          setAccountDeletionError("");
                        }}
                        disabled={accountDeleting}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="header-inner">
          <div className="brand-area">
            {league.logo_url ? (
              <img
                className="league-logo"
                src={
                  league.logo_url
                }
                alt=""
              />
            ) : (
              <BrandMark className="brand-icon" />
            )}

            <div>
              <h1>
                Table Talk Table Tennis
              </h1>

              <p>
                {league.name}
              </p>
            </div>
          </div>

          <div className="header-right">
            <div className="league-code-box">
              <span>
                LEAGUE CODE
              </span>

              <button
                onClick={
                  copyLeagueCode
                }
              >
                {league.join_code}
                <AppIcon name="copy" size={14} />
              </button>
            </div>

            <button
              className="header-signout-button"
              onClick={
                signOut
              }
            >
              Sign Out
            </button>
          </div>

          <details ref={mobileHeaderMenuRef} className="mobile-header-menu">
            <summary aria-label="Open league menu">
              <AppIcon name="more" size={22} />
            </summary>

            <div className="mobile-header-menu-panel">
              <button
                type="button"
                onClick={goToMyLeagues}
              >
                <AppIcon name="home" size={17} />
                <span>My Leagues</span>
              </button>

              <button
                type="button"
                onClick={copyLeagueCode}
              >
                <AppIcon name="copy" size={17} />
                <span>Copy League Code</span>
                <strong>{league.join_code}</strong>
              </button>

              <button
                type="button"
                onClick={() => changeTab("tournaments")}
              >
                <AppIcon name="bracket" size={17} />
                <span>Tournaments</span>
              </button>

              <button
                type="button"
                onClick={() => changeTab("tables")}
              >
                <AppIcon name="location" size={17} />
                <span>Find Tables</span>
              </button>

              <button
                type="button"
                onClick={() => openLegalPage("support")}
              >
                <AppIcon name="settings" size={17} />
                <span>Support & Safety</span>
              </button>

              {isAppModerator && (
                <button
                  type="button"
                  onClick={() => changeTab("moderation")}
                >
                  <AppIcon name="settings" size={17} />
                  <span>Moderator Queue</span>
                </button>
              )}

              <button
                type="button"
                className="mobile-menu-signout"
                onClick={signOut}
              >
                <AppIcon name="logout" size={17} />
                <span>Sign Out</span>
              </button>
            </div>
          </details>
        </div>

        <nav>
          <button
            onClick={
              goToMyLeagues
            }
          >
            <AppIcon name="home" size={17} /> My Leagues
          </button>

          <button
            className={
              activeTab ===
              "leaderboard"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changeTab(
                "leaderboard"
              )
            }
          >
            <AppIcon name="trophy" size={17} /> Leaderboard
          </button>

          <button
            className={activeTab === "tournaments" ? "nav-active" : ""}
            onClick={() => changeTab("tournaments")}
          >
            <AppIcon name="bracket" size={17} /> Tournaments
          </button>

          <button
            className={
              activeTab ===
              "record"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changeTab(
                "record"
              )
            }
          >
            <AppIcon name="plus" size={17} /> Record Match
          </button>

          <button
            className={
              activeTab ===
                "players" ||
              (activeTab ===
                "profile" &&
                selectedPlayerId !==
                  currentPlayer?.id)
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changeTab(
                "players"
              )
            }
          >
            <AppIcon name="users" size={17} /> Players
          </button>

          <button
            className={
              activeTab ===
                "profile" &&
              selectedPlayerId ===
                currentPlayer?.id
                ? "nav-active"
                : ""
            }
            onClick={
              openMyProfile
            }
          >
            <AppIcon name="user" size={17} /> My Profile
          </button>

          <button
            className={
              activeTab ===
              "my-matches"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changeTab(
                "my-matches"
              )
            }
          >
            <AppIcon name="history" size={17} /> My Matches
          </button>

          <button
            className={
              activeTab ===
              "history"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changeTab(
                "history"
              )
            }
          >
            <AppIcon name="history" size={17} /> Match History
          </button>

          <button
            className={activeTab === "tables" ? "nav-active" : ""}
            onClick={() => changeTab("tables")}
          >
            <AppIcon name="location" size={17} /> Find Tables
          </button>

          <button
            className={activeTab === "chat" ? "nav-active" : ""}
            onClick={() => changeTab("chat")}
          >
            <AppIcon name="chat" size={17} />
            League Chat
            {chatUnread > 0 && (
              <span className="nav-unread-badge">
                {chatUnread > 99 ? "99+" : chatUnread}
              </span>
            )}
          </button>

          {isAppModerator && (
            <button
              className={activeTab === "moderation" ? "nav-active" : ""}
              onClick={() => changeTab("moderation")}
            >
              <AppIcon name="settings" size={17} /> Moderator Queue
            </button>
          )}

          {isAdmin && (
            <button
              className={
                activeTab ===
                "admin"
                  ? "nav-active"
                  : ""
              }
              onClick={() =>
                changeTab(
                  "admin"
                )
              }
            >
              <AppIcon name="settings" size={17} /> Admin
            </button>
          )}
        </nav>
      </header>

      {league.banner_url && (
        <div
          className={`league-banner ${
            activeTab === "leaderboard" ? "board-league-banner" : ""
          }`}
        >
          <img
            src={
              league.banner_url
            }
            alt=""
          />
        </div>
      )}

      <main>
        {league.description &&
          activeTab !==
            "admin" &&
          activeTab !==
            "profile" &&
          activeTab !==
            "leaderboard" &&
          activeTab !==
            "tables" &&
          activeTab !==
            "tournaments" &&
          activeTab !==
            "chat" &&
          activeTab !==
            "moderation" &&
          activeTab !==
            "history" && (
            <div className="league-description">
              {
                league.description
              }
            </div>
          )}

        {activeTab ===
          "leaderboard" && (
          <>
            <div className="page-heading-row board-heading-row">
              <div>
                <h2>Board</h2>
                <p>League rankings and performance.</p>
              </div>

              <div className="board-heading-actions">
                <button
                  className="secondary-button board-players-button"
                  onClick={() => changeTab("players")}
                >
                  <AppIcon name="users" size={17} />
                  Players
                </button>

                <button
                  className="primary-button board-record-button"
                  onClick={() => changeTab("record")}
                >
                  <AppIcon name="plus" size={17} />
                  Record Match
                </button>
              </div>
            </div>

            <div className="board-quick-stats" aria-label="League snapshot">
              <button
                type="button"
                className={
                  boardDetailMode === "players"
                    ? "board-quick-stat board-quick-stat-active"
                    : "board-quick-stat"
                }
                onClick={() => showBoardDetail("players")}
              >
                <span>Active Players</span>
                <strong>{activePlayers.length}</strong>
                <small>View roster</small>
              </button>

              <button
                type="button"
                className="board-quick-stat"
                onClick={() => changeTab("history")}
              >
                <span>Match History</span>
                <strong>{matches.length}</strong>
                <small>Open history</small>
              </button>

              <button
                type="button"
                className={
                  boardDetailMode === "leader"
                    ? "board-quick-stat board-quick-stat-active"
                    : "board-quick-stat"
                }
                onClick={() => showBoardDetail("leader")}
              >
                <span>Current Leader</span>
                <strong>{leader ? leader.name : "—"}</strong>
                <small>View leader</small>
              </button>
            </div>

            <div className="card ranking-card board-ranking-card">
              <div className="ranking-card-heading">
                <div>
                  <h3>League Ratings</h3>
                  <p>
                    USATT-inspired head-to-head ratings. Players become officially ranked after five matches.
                  </p>
                </div>

                <button
                  className="rank-info-button"
                  onClick={() => setRankInfoMode("league")}
                >
                  How is rank determined?
                </button>
              </div>

              <div className="board-swipe-hint">
                Swipe for more stats →
              </div>

              <div className="table-wrap board-rating-table-wrap">
                <table className="league-rating-table">
                  <thead>
                    <tr>
                      <th className="board-rank-column">Rank</th>
                      <th>Player</th>
                      <th>Rating</th>
                      <th>Win %</th>
                      <th>Streak</th>
                      <th>Games W-L</th>
                      <th>Pts For</th>
                      <th>Pts Against</th>
                      <th>Pts Won %</th>
                      <th>Pts Against %</th>
                      <th>Point +/-</th>
                    </tr>
                  </thead>

                  <tbody>
                    {activeStandings.map((player) => {
                      const officialRank =
                        player.officialRank;

                      const placementClass =
                        officialRank === 1
                          ? "champion-row"
                          : officialRank === 2
                          ? "placement-silver-row"
                          : officialRank === 3
                          ? "placement-bronze-row"
                          : "";

                      const textClass =
                        officialRank === 1
                          ? "champion-text"
                          : officialRank === 2
                          ? "placement-silver-text"
                          : officialRank === 3
                          ? "placement-bronze-text"
                          : "";

                      const rankLabel =
                        player.qualification === "ranked"
                          ? officialRank
                          : player.qualification === "provisional"
                          ? "P"
                          : "—";

                      return (
                        <tr
                          key={player.id}
                          className={placementClass}
                        >
                          <td className="board-rank-cell">
                            <span
                              className={textClass}
                              title={
                                player.qualification === "provisional"
                                  ? "Provisional: five matches are required for an official rank."
                                  : player.qualification === "unranked"
                                  ? "Unranked: no matches played."
                                  : `Official league rank ${officialRank}`
                              }
                            >
                              {rankLabel}
                            </span>
                          </td>

                          <td className="board-player-cell">
                            <button
                              className="player-profile-link board-player-link"
                              onClick={() =>
                                openPlayerProfile(player.id)
                              }
                            >
                              <span
                                className={`board-status-dot board-status-${player.play_status === "open" ? "open" : "idle"}`}
                                title={
                                  player.play_status === "open"
                                    ? "Open to Play"
                                    : "Idle"
                                }
                                aria-label={
                                  player.play_status === "open"
                                    ? "Open to Play"
                                    : "Idle"
                                }
                              />

                              <PlayerAvatar
                                player={player}
                                size="small"
                              />

                              <span className="board-player-copy">
                                <span className="board-player-name-line">
                                  <strong className={textClass}>
                                    {player.name}
                                  </strong>
                                </span>

                                <span className="board-player-record">
                                  <span className="board-player-win">
                                    W: {player.wins}
                                  </span>
                                  <span className="board-player-loss">
                                    L: {player.losses}
                                  </span>
                                </span>
                              </span>
                            </button>
                          </td>

                          <td>
                            <strong className={textClass}>
                              {player.rating}
                            </strong>
                          </td>

                          <td>
                            <span className={textClass}>
                              {player.winPercentage}%
                            </span>
                          </td>

                          <td>
                            <span className={textClass}>
                              {player.winStreak > 0
                                ? `W${player.winStreak}`
                                : "—"}
                            </span>
                          </td>

                          <td>
                            <span className={textClass}>
                              {player.gamesWon}-{player.gamesLost}
                            </span>
                          </td>

                          <td>
                            <span className={textClass}>
                              {player.pointsFor}
                            </span>
                          </td>

                          <td>
                            <span className={textClass}>
                              {player.pointsAgainst}
                            </span>
                          </td>

                          <td>
                            <span className={textClass}>
                              {player.pointsWonPercentage}%
                            </span>
                          </td>

                          <td>
                            <span className={textClass}>
                              {Math.round(
                                (100 - player.pointsWonPercentage) * 10
                              ) / 10}%
                            </span>
                          </td>

                          <td>
                            <span className={textClass}>
                              {formatSigned(player.pointDifferential)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="ranking-footnote">
                <span><strong>P</strong> = provisional (1–4 matches)</span>
                <span>5+ matches = officially ranked</span>
              </div>
            </div>

            <div className="card league-landscape-card">
              <div className="ranking-card-heading">
                <div>
                  <h3>League Landscape</h3>
                  <p>
                    Rating versus matches played. This makes sample size visible alongside skill.
                  </p>
                </div>
              </div>

              <LeagueLandscapeChart
                players={activeStandings}
                onPlayerClick={openPlayerProfile}
              />
            </div>

            {boardDetailMode && (
              <div
                id="board-detail-panel"
                className="card board-detail-panel"
              >
                <div className="board-detail-heading">
                  <div>
                    <p className="season-label">LEAGUE SNAPSHOT</p>
                    <h3>
                      {boardDetailMode === "players"
                        ? "Active Players"
                        : boardDetailMode === "matches"
                        ? "Match Activity"
                        : "Current Leader"}
                    </h3>
                  </div>

                  <button
                    type="button"
                    className="board-detail-close"
                    onClick={() => setBoardDetailMode(null)}
                  >
                    Close
                  </button>
                </div>

                {boardDetailMode === "players" && (
                  <div className="board-roster-list">
                    {activeStandings.map((player) => (
                      <button
                        type="button"
                        className="board-roster-row"
                        key={player.id}
                        onClick={() => openPlayerProfile(player.id)}
                      >
                        <div className="board-roster-player">
                          <PlayerAvatar player={player} size="small" />
                          <div>
                            <strong>{player.name}</strong>
                            <span>
                              <span className="board-player-win">
                                W: {player.wins}
                              </span>
                              {" · "}
                              <span className="board-player-loss">
                                L: {player.losses}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="board-roster-metrics">
                          <span>Rating <strong>{player.rating}</strong></span>
                          <span>SOS <strong>{player.averageOpponentRating ?? "—"}</strong></span>
                          <StatusBadge status={player.play_status} />
                        </div>
                      </button>
                    ))}

                    <button
                      type="button"
                      className="secondary-button board-view-all-players"
                      onClick={() => changeTab("players")}
                    >
                      <AppIcon name="users" size={16} />
                      Open Full Players Page
                    </button>
                  </div>
                )}

                {boardDetailMode === "matches" && (
                  <div className="board-match-activity">
                    <div className="board-detail-stat-grid">
                      <div>
                        <span>Today</span>
                        <strong>{boardMatchActivity.today}</strong>
                      </div>
                      <div>
                        <span>Last 7 Days</span>
                        <strong>{boardMatchActivity.last7}</strong>
                      </div>
                      <div>
                        <span>Last 30 Days</span>
                        <strong>{boardMatchActivity.last30}</strong>
                      </div>
                      <div>
                        <span>All Time</span>
                        <strong>{matches.length}</strong>
                      </div>
                    </div>

                    {boardMatchActivity.latest ? (
                      <div className="board-latest-match">
                        <span>Most Recent Match</span>
                        <strong>
                          {getPlayerName(boardMatchActivity.latest.player_a_id)}
                          {" "}
                          {getMatchResult(boardMatchActivity.latest).aWins}
                          {" – "}
                          {getMatchResult(boardMatchActivity.latest).bWins}
                          {" "}
                          {getPlayerName(boardMatchActivity.latest.player_b_id)}
                        </strong>
                        <small>
                          {new Date(
                            boardMatchActivity.latest.created_at
                          ).toLocaleString()}
                        </small>
                      </div>
                    ) : (
                      <p className="muted-copy">No matches recorded yet.</p>
                    )}

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => changeTab("history")}
                    >
                      Open Match History
                    </button>
                  </div>
                )}

                {boardDetailMode === "leader" && (
                  <>
                    {leader ? (
                      <div className="board-leader-detail">
                        <PlayerAvatar player={leader} size="large" />

                        <div className="board-leader-identity">
                          <span>Current League Leader</span>
                          <h3>{leader.name}</h3>
                          <div className="board-player-record board-leader-record">
                            <span className="board-player-win">
                              W: {leader.wins}
                            </span>
                            <span className="board-player-loss">
                              L: {leader.losses}
                            </span>
                          </div>
                        </div>

                        <div className="board-leader-metrics">
                          <div>
                            <span>Rating</span>
                            <strong>{leader.rating}</strong>
                          </div>
                          <div>
                            <span>Strength</span>
                            <strong>{leader.averageOpponentRating ?? "—"}</strong>
                          </div>
                          <div>
                            <span>Win Streak</span>
                            <strong>
                              {leader.winStreak > 0
                                ? `W${leader.winStreak}`
                                : "—"}
                            </strong>
                          </div>
                          <div>
                            <span>Point +/-</span>
                            <strong>
                              {formatSigned(leader.pointDifferential)}
                            </strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => openPlayerProfile(leader.id)}
                        >
                          View Player Profile
                        </button>
                      </div>
                    ) : (
                      <p className="muted-copy">
                        The league will have a leader once matches are recorded.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {league.description && (
              <div className="board-about-strip">
                <strong>About this league</strong>
                <span>{league.description}</span>
              </div>
            )}
          </>
        )}

        {activeTab === "tables" && (
          <Suspense fallback={<div className="card">Loading table map…</div>}>
            <TableLocator userId={user?.id} />
          </Suspense>
        )}

        {activeTab === "moderation" && isAppModerator && (
          <Suspense fallback={<div className="card">Loading moderator queue…</div>}>
            <ModeratorQueue />
          </Suspense>
        )}

        {activeTab === "tournaments" && (
          <Suspense fallback={<div className="card">Loading tournaments…</div>}>
            <TournamentCenter
              league={league}
              currentPlayer={currentPlayer}
              players={activeStandings}
              isAdmin={isAdmin}
            />
          </Suspense>
        )}

        {activeTab ===
          "record" && (
          <div className="card">
            <h2>Record a Match</h2>

            <p>
              Record your own match quickly, or log a match for two other league members.
            </p>

            <div className="record-mode-switch" role="group" aria-label="Match entry mode">
              <button
                type="button"
                className={recordMode === "mine" ? "record-mode-active" : ""}
                onClick={() => chooseRecordMode("mine")}
              >
                My Match
              </button>
              <button
                type="button"
                className={recordMode === "others" ? "record-mode-active" : ""}
                onClick={() => chooseRecordMode("others")}
              >
                Other Players
              </button>
            </div>

            <p className="record-mode-help">
              {recordMode === "mine"
                ? "You are Player 1. Choose your opponent and enter the final scores."
                : "Use this when you are recording a completed match for two other players."}
            </p>

            <form
              onSubmit={
                recordMatch
              }
            >
              <div className="form-grid">
                <div>
                  <label>
                    Player 1
                  </label>

                  {recordMode === "mine" ? (
                    <div className="record-player-locked">
                      <PlayerAvatar
                        player={currentPlayer}
                        size="small"
                      />
                      <div>
                        <strong>{currentPlayer?.name || "You"}</strong>
                        <span>Your player profile</span>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={playerA}
                      onChange={(e) =>
                        setPlayerA(
                          e.target.value
                        )
                      }
                    >
                      <option value="">
                        Choose player
                      </option>

                      {activePlayers.map(
                        (player) => (
                          <option
                            key={player.id}
                            value={player.id}
                            disabled={player.id === playerB}
                          >
                            {player.play_status === "open" ? "Open · " : ""}
                            {player.name}
                          </option>
                        )
                      )}
                    </select>
                  )}
                </div>

                <div>
                  <label>
                    Player 2
                  </label>

                  <select
                    value={playerB}
                    onChange={(e) =>
                      setPlayerB(
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      {recordMode === "mine"
                        ? "Choose your opponent"
                        : "Choose player"}
                    </option>

                    {activePlayers.map(
                      (player) => (
                        <option
                          key={player.id}
                          value={player.id}
                          disabled={player.id === playerA}
                        >
                          {player.play_status === "open" ? "Open · " : ""}
                          {player.name}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="format-row">
                <label>
                  Match Format
                </label>

                <select
                  value={
                    format
                  }
                  onChange={(e) => {
                    setFormat(
                      Number(
                        e.target
                          .value
                      )
                    );

                    resetScores();
                  }}
                >
                  <option value={1}>
                    Single Game
                  </option>

                  <option value={3}>
                    Best of 3
                  </option>

                  <option value={5}>
                    Best of 5
                  </option>
                </select>
              </div>

              <div className="score-section">
                <h3>
                  Game Scores
                </h3>

                {gameScores
                  .slice(
                    0,
                    format
                  )
                  .map(
                    (
                      game,
                      index
                    ) => (
                      <div
                        className="score-row"
                        key={
                          index
                        }
                      >
                        <strong>
                          Game{" "}
                          {index +
                            1}
                        </strong>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={
                            game.a
                          }
                          placeholder={
                            playerA
                              ? getPlayerName(
                                  playerA
                                )
                              : "P1"
                          }
                          onChange={(
                            e
                          ) =>
                            updateGameScore(
                              index,
                              "a",
                              e
                                .target
                                .value
                            )
                          }
                        />

                        <span>
                          –
                        </span>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={
                            game.b
                          }
                          placeholder={
                            playerB
                              ? getPlayerName(
                                  playerB
                                )
                              : "P2"
                          }
                          onChange={(
                            e
                          ) =>
                            updateGameScore(
                              index,
                              "b",
                              e
                                .target
                                .value
                            )
                          }
                        />
                      </div>
                    )
                  )}
              </div>

              {errorMessage && (
                <div className="error-message">
                  {
                    errorMessage
                  }
                </div>
              )}

              <button
                className="primary-button"
                disabled={
                  saving
                }
              >
                {saving
                  ? "Saving..."
                  : "Save Match"}
              </button>
            </form>
          </div>
        )}

        {activeTab ===
          "players" && (
          <>
            <div className="players-heading">
              <div>
                <p className="season-label">
                  LEAGUE MEMBERS
                </p>

                <h2>
                  Players
                </h2>

                <p>
                  Click any player to view their full profile and stats.
                </p>
              </div>

              <div className="your-status-card">
                <span>
                  YOUR STATUS
                </span>

                <div className="status-toggle">
                  <button
                    className={
                      currentPlayer?.play_status ===
                      "open"
                        ? "status-toggle-active-open"
                        : ""
                    }
                    onClick={() =>
                      updateAvailability(
                        "open"
                      )
                    }
                    disabled={
                      statusUpdating
                    }
                  >
                    Open to Play
                  </button>

                  <button
                    className={
                      currentPlayer?.play_status ===
                      "idle"
                        ? "status-toggle-active-idle"
                        : ""
                    }
                    onClick={() =>
                      updateAvailability(
                        "idle"
                      )
                    }
                    disabled={
                      statusUpdating
                    }
                  >
                    ⚪ Idle
                  </button>
                </div>
              </div>
            </div>

            <div className="player-grid">
              {activeStandings.map(
                (
                  player,
                  index
                ) => (
                  <button
                    className="card player-card player-card-clickable"
                    key={
                      player.id
                    }
                    onClick={() =>
                      openPlayerProfile(
                        player.id
                      )
                    }
                  >
                    <div className="player-card-top">
                      <span className="player-rank">
                        #
                        {index +
                          1}
                      </span>

                      <StatusBadge
                        status={
                          player.play_status
                        }
                      />
                    </div>

                    <PlayerAvatar
                      player={
                        player
                      }
                      size="large"
                    />

                    <h3>
                      {
                        player.name
                      }
                    </h3>

                    {player.member_role ===
                      "admin" && (
                      <span className="admin-badge">
                        LEAGUE ADMIN
                      </span>
                    )}

                    <div className="player-rating">
                      {
                        player.rating
                      }
                    </div>

                    <span className="rating-label">
                      League Rating
                    </span>

                    <div className="player-stats">
                      <div>
                        <strong>
                          {
                            player.wins
                          }
                        </strong>

                        <span>
                          Wins
                        </span>
                      </div>

                      <div>
                        <strong>
                          {
                            player.losses
                          }
                        </strong>

                        <span>
                          Losses
                        </span>
                      </div>

                      <div>
                        <strong>
                          {player.averageOpponentRating ?? "—"}
                        </strong>

                        <span>
                          Avg. Opponent
                        </span>
                      </div>
                    </div>

                    <div className="view-profile-label">
                      View Profile →
                    </div>
                  </button>
                )
              )}
            </div>
          </>
        )}

        {activeTab ===
          "profile" &&
          selectedPlayer &&
          selectedStats && (
          <>
            <button
              className="back-button"
              onClick={() =>
                changeTab(
                  profileReturnTab
                )
              }
            >
              ← Back
            </button>

            <div className="player-profile-hero">
              <div className="profile-avatar-wrap">
                <PlayerAvatar
                  player={
                    selectedPlayer
                  }
                  size="xlarge"
                />
              </div>

              <div className="player-profile-identity">
                <div className="profile-badge-row">
                  <StatusBadge
                    status={
                      selectedPlayer.play_status
                    }
                  />

                  {selectedPlayer.member_role ===
                    "admin" && (
                    <span className="admin-badge profile-admin-badge">
                      LEAGUE ADMIN
                    </span>
                  )}

                  {selectedPlayer.user_id ===
                    user?.id && (
                    <span className="you-badge">
                      YOU
                    </span>
                  )}
                </div>

                <h2>
                  {
                    selectedPlayer.name
                  }
                </h2>

                <p className="profile-bio">
                  {selectedPlayer.profile_description ||
                    "No player bio yet."}
                </p>
              </div>

              <div className="profile-elo-block">
                <strong>
                  {
                    selectedStats.rating
                  }
                </strong>

                <span>
                  LEAGUE RATING
                </span>

                <div className="profile-rank">
                  {selectedStats.qualification === "ranked"
                    ? `League Rank ${selectedStats.officialRank}`
                    : selectedStats.qualification === "provisional"
                    ? `Provisional · ${selectedStats.matchesPlayed}/5 matches`
                    : "Unranked"}
                </div>
              </div>
            </div>

            <div className="profile-fun-facts">
              <div className="profile-fact-card">
                <span>
                  HEIGHT
                </span>

                <strong>
                  {selectedPlayer.height_text ||
                    "Not listed"}
                </strong>
              </div>

              <div className="profile-fact-card velocity-card">
                <span>
                  AVG. BALL VELOCITY
                </span>

                <strong>
                  {selectedPlayer.avg_ball_velocity !=
                  null
                    ? `${selectedPlayer.avg_ball_velocity} MPH`
                    : "Not yet clocked"}
                </strong>

                <small>
                  Extremely scientific.
                </small>
              </div>

              <div className="profile-fact-card">
                <span>
                  AVAILABILITY
                </span>

                <strong>
                  {selectedPlayer.play_status ===
                  "open"
                    ? "Challenge Accepted"
                    : "Currently Idle"}
                </strong>
              </div>
            </div>

            <div className="profile-stat-grid">
              <div className="profile-stat-card">
                <span>
                  Record
                </span>

                <strong>
                  {
                    selectedStats.wins
                  }
                  -
                  {
                    selectedStats.losses
                  }
                </strong>
              </div>

              <div className="profile-stat-card">
                <span>
                  Win Rate
                </span>

                <strong>
                  {
                    selectedStats.winPercentage
                  }
                  %
                </strong>
              </div>

              <div className="profile-stat-card">
                <span>
                  Strength of Schedule
                </span>

                <strong>
                  {selectedStats.averageOpponentRating ?? "—"}
                </strong>
              </div>

              <div className="profile-stat-card">
                <span>
                  Matches
                </span>

                <strong>
                  {
                    selectedStats.matchesPlayed
                  }
                </strong>
              </div>

              <div className="profile-stat-card">
                <span>
                  Games
                </span>

                <strong>
                  {
                    selectedStats.gamesWon
                  }
                  -
                  {
                    selectedStats.gamesLost
                  }
                </strong>
              </div>

              <div className="profile-stat-card">
                <span>
                  Point +/-
                </span>

                <strong>
                  {selectedStats.pointDifferential > 0 ? "+" : ""}
                  {selectedStats.pointDifferential}
                </strong>
              </div>

              <div className="profile-stat-card">
                <span>Win Streak</span>
                <strong>
                  {selectedStats.winStreak > 0
                    ? `${selectedStats.winStreak} Win${selectedStats.winStreak === 1 ? "" : "s"}`
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="card performance-card">
              <div className="performance-heading">
                <div>
                  <p className="season-label">PERFORMANCE</p>
                  <h3>Performance Over Time</h3>
                  <p>
                    Follow rating movement and point performance as this player competes.
                  </p>
                  <span className="performance-period-count">
                    {selectedPerformanceHistory.length} {selectedPerformanceHistory.length === 1 ? "match" : "matches"} in this period
                  </span>
                </div>

                <div className="performance-range-tabs">
                  {[
                    ["7d", "7 Days"],
                    ["30d", "30 Days"],
                    ["6m", "6 Months"],
                    ["1y", "1 Year"],
                    ["all", "All Time"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        performanceRange === value
                          ? "performance-range-active"
                          : ""
                      }
                      onClick={() => setPerformanceRange(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="performance-summary-grid">
                <div>
                  <span>Record</span>
                  <strong>
                    {selectedRangeStats.wins}-{selectedRangeStats.losses}
                  </strong>
                </div>
                <div>
                  <span>Point +/-</span>
                  <strong>
                    {formatSigned(selectedRangeStats.pointDifferential)}
                  </strong>
                </div>
                <div>
                  <span>Points Won</span>
                  <strong>
                    {selectedRangeStats.pointsWonPercentage}%
                  </strong>
                </div>
                <div>
                  <span>Rating Change</span>
                  <strong>
                    {formatSigned(selectedRangeStats.ratingChange)}
                  </strong>
                </div>
              </div>

              <div className="performance-chart-grid">
                <div className="performance-chart-card">
                  <div className="performance-chart-title">
                    <h4>League Rating Trend</h4>
                    <span>Higher is better</span>
                  </div>
                  <SimpleLineChart
                    data={selectedPerformanceHistory}
                    valueKey="eloAfter"
                  />
                </div>

                <div className="performance-chart-card">
                  <div className="performance-chart-title">
                    <h4>Point Differential by Match</h4>
                    <span>Points scored minus points allowed</span>
                  </div>
                  <PointDifferentialChart
                    data={selectedPerformanceHistory}
                  />
                </div>
              </div>
            </div>

            {selectedPlayer.user_id ===
              user?.id && (
              <>
                <div className="card edit-profile-card">
                  <div className="edit-profile-heading">
                    <div>
                      <p className="season-label">
                        MY SETTINGS
                      </p>

                      <h3>
                        Edit My Profile
                      </h3>
                    </div>

                    <label className="avatar-upload-button">
                      {avatarUploading
                        ? "Uploading..."
                        : currentPlayer?.avatar_url
                        ? "Change Photo"
                        : "Add Photo"}

                      <input
                        className="avatar-file-input"
                        type="file"
                        accept="image/*"
                        onChange={
                          handleAvatarUpload
                        }
                        disabled={
                          avatarUploading
                        }
                      />
                    </label>
                  </div>

                  <div className="availability-editor">
                    <label>
                      Availability
                    </label>

                    <div className="status-toggle">
                      <button
                        className={
                          currentPlayer?.play_status ===
                          "open"
                            ? "status-toggle-active-open"
                            : ""
                        }
                        onClick={() =>
                          updateAvailability(
                            "open"
                          )
                        }
                        disabled={
                          statusUpdating
                        }
                        type="button"
                      >
                        Open to Play
                      </button>

                      <button
                        className={
                          currentPlayer?.play_status ===
                          "idle"
                            ? "status-toggle-active-idle"
                            : ""
                        }
                        onClick={() =>
                          updateAvailability(
                            "idle"
                          )
                        }
                        disabled={
                          statusUpdating
                        }
                        type="button"
                      >
                        ⚪ Idle
                      </button>
                    </div>
                  </div>

                  <form
                    onSubmit={
                      saveMyProfile
                    }
                  >
                    <label>
                      Player Name
                    </label>

                    <input
                      value={
                        profileNameDraft
                      }
                      onChange={(e) =>
                        setProfileNameDraft(
                          e.target
                            .value
                        )
                      }
                      maxLength="80"
                      placeholder="Your player name"
                    />

                    <p className="form-help">
                      Player names must be unique inside this league.
                    </p>

                    <label>
                      Player Description
                    </label>

                    <textarea
                      rows="4"
                      maxLength="500"
                      value={
                        profileDescriptionDraft
                      }
                      onChange={(e) =>
                        setProfileDescriptionDraft(
                          e.target
                            .value
                        )
                      }
                      placeholder="Tell the league a little about yourself, your playing style, your trash talk policy..."
                    />

                    <div className="profile-edit-grid">
                      <div>
                        <label>
                          Height
                        </label>

                        <input
                          type="text"
                          maxLength="30"
                          value={
                            heightDraft
                          }
                          onChange={(e) =>
                            setHeightDraft(
                              e.target
                                .value
                            )
                          }
                          placeholder={`6'1"`}
                        />
                      </div>

                      <div>
                        <label>
                          Average Ball Velocity
                        </label>

                        <div className="velocity-input">
                          <input
                            type="number"
                            min="0"
                            max="500"
                            step="0.1"
                            value={
                              velocityDraft
                            }
                            onChange={(e) =>
                              setVelocityDraft(
                                e.target
                                  .value
                              )
                            }
                            placeholder="63.7"
                          />

                          <span>
                            MPH
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="velocity-disclaimer">
                      Ball velocity is self-reported and has undergone absolutely no independent verification.
                    </p>

                    <button
                      className="primary-button"
                      disabled={
                        profileSaving
                      }
                    >
                      {profileSaving
                        ? "Saving..."
                        : "Save Profile"}
                    </button>
                  </form>
                </div>

                <div className="card account-security-card">
                  <p className="season-label">
                    ACCOUNT
                  </p>

                  <h3>
                    Account & Security
                  </h3>

                  <p>
                    Your login email stays private and is not displayed to other league members.
                  </p>

                  <div className="profile-display-setting">
                    <div>
                      <strong>Display Mode</strong>
                      <span>Switch between light and dark mode.</span>
                    </div>
                    <ThemeControl
                      theme={themeMode}
                      onChange={updateThemePreference}
                      saving={themeSaving}
                    />
                  </div>

                  <div className="account-security-actions">
                    <button
                      className="secondary-button"
                      onClick={
                        sendMyPasswordReset
                      }
                      disabled={
                        saving
                      }
                    >
                      Send Password Reset Email
                    </button>

                    <button
                      className="danger-outline-button"
                      onClick={
                        leaveLeague
                      }
                      disabled={
                        saving
                      }
                    >
                      Leave This League
                    </button>
                  </div>

                  {isAdmin && (
                    <p className="form-help">
                      If you are the league's only admin, you must make someone else an admin before you can leave.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="profile-two-column">
              <div className="card">
                <h3>Head-to-Head</h3>

                {headToHead.length ===
                0 ? (
                  <p className="muted-copy">
                    No head-to-head matches yet.
                  </p>
                ) : (
                  <div className="head-to-head-list">
                    {headToHead.map(
                      (record) => {
                        const opponent =
                          getPlayer(
                            record.opponentId
                          );

                        return (
                          <button
                            className="head-to-head-row"
                            key={
                              record.opponentId
                            }
                            onClick={() =>
                              openPlayerProfile(
                                record.opponentId
                              )
                            }
                          >
                            <div className="head-to-head-player">
                              <PlayerAvatar
                                player={
                                  opponent
                                }
                                size="small"
                              />

                              <strong>
                                {
                                  opponent?.name
                                }
                              </strong>
                            </div>

                            <div className="head-to-head-record">
                              <strong>
                                {
                                  record.wins
                                }
                                -
                                {
                                  record.losses
                                }
                              </strong>

                              <span>
                                {
                                  record.matches
                                }{" "}
                                matches
                              </span>
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </div>

              <div className="card">
                <h3>Recent Matches</h3>

                {selectedRecentMatches.length ===
                0 ? (
                  <p className="muted-copy">
                    No matches recorded yet.
                  </p>
                ) : (
                  <div className="profile-recent-list">
                    {selectedRecentMatches.map(
                      (match) => {
                        const result =
                          getMatchResult(
                            match
                          );

                        const selectedIsA =
                          match.player_a_id ===
                          selectedPlayer.id;

                        const opponentId =
                          selectedIsA
                            ? match.player_b_id
                            : match.player_a_id;

                        const opponent =
                          getPlayer(
                            opponentId
                          );

                        const selectedScore =
                          selectedIsA
                            ? result.aWins
                            : result.bWins;

                        const opponentScore =
                          selectedIsA
                            ? result.bWins
                            : result.aWins;

                        const won =
                          result.winnerId ===
                          selectedPlayer.id;

                        return (
                          <div
                            className="profile-recent-match"
                            key={
                              match.id
                            }
                          >
                            <div
                              className={`result-pill ${
                                won
                                  ? "result-win"
                                  : "result-loss"
                              }`}
                            >
                              {won
                                ? "W"
                                : "L"}
                            </div>

                            <div className="recent-match-copy">
                              <strong>
                                vs.{" "}
                                {
                                  opponent?.name
                                }
                              </strong>

                              <span>
                                {
                                  selectedScore
                                }
                                -
                                {
                                  opponentScore
                                }{" "}
                                •{" "}
                                {getFormatName(
                                  match.format
                                )}
                              </span>
                            </div>

                            <button
                              className="small-profile-link"
                              onClick={() =>
                                openPlayerProfile(
                                  opponentId
                                )
                              }
                            >
                              View
                            </button>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab ===
          "my-matches" && (
          <>
            <div className="page-heading-row">
              <div>
                <p className="season-label">
                  YOUR RESULTS
                </p>

                <h2>
                  My Matches
                </h2>

                <p>
                  Fix a score, remove a game that did not count, or delete an incorrect match.
                </p>
              </div>
            </div>

            <div className="card">
              {myMatches.length ===
              0 ? (
                <div className="empty-state">
                  <div>
                    <AppIcon name="paddle" size={42} />
                  </div>

                  <h3>
                    No matches yet
                  </h3>

                  <p>
                    Once you play, your matches will show up here.
                  </p>

                  <button
                    className="primary-button"
                    onClick={() =>
                      changeTab(
                        "record"
                      )
                    }
                  >
                    Record a Match
                  </button>
                </div>
              ) : (
                <div className="match-list">
                  {myMatches.map(
                    (match) =>
                      renderMatchCard(
                        match,
                        true
                      )
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab ===
          "history" && (
          <div className="card">
            <h2>
              <AppIcon name="history" size={17} /> Match History
            </h2>

            {matches.length ===
            0 ? (
              <p>
                No matches yet.
              </p>
            ) : (
              <div className="match-list">
                {matches.map(
                  (match) =>
                    renderMatchCard(
                      match,
                      true
                    )
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "chat" && (
          <Suspense fallback={<div className="card">Loading chat…</div>}>
            <ChatCenter
              league={league}
              currentPlayer={currentPlayer}
              players={players}
              isAdmin={isAdmin}
              resetSignal={chatOpenRequest}
            />
          </Suspense>
        )}

        {activeTab ===
          "admin" &&
          isAdmin && (
          <>
            <div className="admin-header">
              <div>
                <p className="season-label">
                  LEAGUE MANAGEMENT
                </p>

                <h2>
                  <AppIcon name="settings" size={17} /> Admin
                </h2>

                <p>
                  Customize and manage your league.
                </p>
              </div>
            </div>

            {leagueAccessAvailable && (
              <div className="card league-access-admin-card">
                <div className="league-access-admin-heading">
                  <div>
                    <h3>League Access</h3>
                    <p>Control how new players can join this league.</p>
                  </div>

                  <select
                    value={currentLeagueDirectoryEntry?.access_type || "private"}
                    onChange={(event) =>
                      changeLeagueAccessType(event.target.value)
                    }
                    disabled={saving}
                    aria-label="League access type"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                    <option value="invite_only">Invite only</option>
                  </select>
                </div>

                {pendingJoinRequests.length > 0 && (
                  <div className="league-request-list">
                    <h4>Pending Requests</h4>
                    {pendingJoinRequests.map((request) => (
                      <div className="league-request-row" key={request.request_id}>
                        <div>
                          <strong>{request.player_name}</strong>
                          <small>Requested to join</small>
                        </div>
                        <div className="league-request-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={saving}
                            onClick={() =>
                              reviewLeagueJoinRequest(request.request_id, false)
                            }
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            disabled={saving}
                            onClick={() =>
                              reviewLeagueJoinRequest(request.request_id, true)
                            }
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form className="league-invite-form" onSubmit={sendLeagueInvitation}>
                  <label htmlFor="league-invite-email">Invite by email</label>
                  <div>
                    <input
                      id="league-invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="player@example.com"
                      required
                    />
                    <button className="primary-button" disabled={saving}>
                      Send Invite
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="card">
              <h3>
                League Profile
              </h3>

              <label>
                League Description
              </label>

              <textarea
                className="league-description-input"
                rows="4"
                value={
                  leagueDescriptionDraft
                }
                onChange={(e) =>
                  setLeagueDescriptionDraft(
                    e.target
                      .value
                  )
                }
                placeholder="Tell players what this league is about..."
              />

              <button
                className="primary-button"
                onClick={
                  saveLeagueDescription
                }
                disabled={
                  saving
                }
              >
                {saving
                  ? "Saving..."
                  : "Save Description"}
              </button>

              <div className="branding-settings">
                <div className="branding-setting-card">
                  <h4>
                    League Logo
                  </h4>

                  <p className="setting-help">
                    Best for a square logo or icon.
                  </p>

                  {league.logo_url && (
                    <img
                      className="branding-preview-logo"
                      src={
                        league.logo_url
                      }
                      alt=""
                    />
                  )}

                  <label
                    className={`avatar-upload-button ${
                      logoUploading
                        ? "upload-disabled"
                        : ""
                    }`}
                  >
                    {logoUploading
                      ? "Uploading Logo..."
                      : league.logo_url
                      ? "Change Logo"
                      : "Upload Logo"}

                    <input
                      className="avatar-file-input"
                      type="file"
                      accept="image/*"
                      disabled={
                        logoUploading
                      }
                      onChange={(e) =>
                        uploadLeagueAsset(
                          e,
                          "logo"
                        )
                      }
                    />
                  </label>

                  {league.logo_url && (
                    <button
                      className="remove-image-button"
                      onClick={() =>
                        removeLeagueAsset(
                          "logo"
                        )
                      }
                    >
                      Remove Logo
                    </button>
                  )}
                </div>

                <div className="branding-setting-card">
                  <h4>
                    League Banner
                  </h4>

                  <p className="setting-help">
                    Best for a wide horizontal image.
                  </p>

                  {league.banner_url && (
                    <img
                      className="branding-preview-banner"
                      src={
                        league.banner_url
                      }
                      alt=""
                    />
                  )}

                  <label
                    className={`avatar-upload-button ${
                      bannerUploading
                        ? "upload-disabled"
                        : ""
                    }`}
                  >
                    {bannerUploading
                      ? "Uploading Banner..."
                      : league.banner_url
                      ? "Change Banner"
                      : "Upload Banner"}

                    <input
                      className="avatar-file-input"
                      type="file"
                      accept="image/*"
                      disabled={
                        bannerUploading
                      }
                      onChange={(e) =>
                        uploadLeagueAsset(
                          e,
                          "banner"
                        )
                      }
                    />
                  </label>

                  {league.banner_url && (
                    <button
                      className="remove-image-button"
                      onClick={() =>
                        removeLeagueAsset(
                          "banner"
                        )
                      }
                    >
                      Remove Banner
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <h3>
                Active Players
              </h3>

              <div className="admin-player-list">
                {activePlayers.map(
                  (player) => (
                    <div
                      className="admin-player-row"
                      key={
                        player.id
                      }
                    >
                      <button
                        className="admin-player-profile-button"
                        onClick={() =>
                          openPlayerProfile(
                            player.id
                          )
                        }
                      >
                        <PlayerAvatar
                          player={
                            player
                          }
                        />

                        <div>
                          <strong>
                            {
                              player.name
                            }
                          </strong>

                          <div className="admin-player-meta">
                            {player.member_role ===
                            "admin"
                              ? "League Admin"
                              : "Player"}
                          </div>
                        </div>
                      </button>

                      <div className="admin-actions">
                        <button
                          onClick={() =>
                            renamePlayer(
                              player
                            )
                          }
                        >
                          Rename
                        </button>

                        <button
                          onClick={() =>
                            changePlayerRole(
                              player
                            )
                          }
                        >
                          {player.member_role ===
                          "admin"
                            ? "Make Player"
                            : "Make Admin"}
                        </button>

                        {player.user_id !==
                          user?.id && (
                          <button
                            className="remove-button"
                            onClick={() =>
                              removePlayer(
                                player
                              )
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {removedPlayers.length >
              0 && (
              <div className="card">
                <h3>
                  Inactive Players
                </h3>

                <p className="muted-copy">
                  Match history is preserved for inactive players.
                </p>

                {removedPlayers.map(
                  (player) => (
                    <div
                      className="admin-player-row"
                      key={
                        player.id
                      }
                    >
                      <div>
                        <strong>
                          {
                            player.name
                          }
                        </strong>

                        <div className="admin-player-meta">
                          {player.removal_reason ===
                          "left"
                            ? "Left league"
                            : "Removed by admin"}
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          restorePlayer(
                            player
                          )
                        }
                      >
                        Restore
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="danger-zone">
              <h3>
                Danger Zone
              </h3>

              <p>
                Permanently delete this league, all player memberships, and every recorded match.
              </p>

              <button
                className="delete-league-button"
                onClick={
                  deleteLeague
                }
                disabled={
                  saving
                }
              >
                Delete Entire League
              </button>
            </div>
          </>
        )}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          className={activeTab === "leaderboard" ? "mobile-nav-active" : ""}
          onClick={() => changeTab("leaderboard")}
        >
          <AppIcon name="trophy" size={20} />
          <small>Board</small>
        </button>

        <button
          className={activeTab === "tournaments" ? "mobile-nav-active" : ""}
          onClick={() => changeTab("tournaments")}
        >
          <AppIcon name="bracket" size={20} />
          <small>Tourney</small>
        </button>

        <button
          className={`mobile-record-button ${
            activeTab === "record" ? "mobile-nav-active" : ""
          }`}
          onClick={() => changeTab("record")}
        >
          <span className="mobile-record-icon">
            <AppIcon name="plus" size={25} />
          </span>
          <small>Record</small>
        </button>

        <button
          className={activeTab === "chat" ? "mobile-nav-active" : ""}
          onClick={() => changeTab("chat")}
        >
          <span className="mobile-nav-icon-wrap">
            <AppIcon name="chat" size={20} />
            {chatUnread > 0 && (
              <span className="mobile-unread-badge">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </span>
          <small>Chat</small>
        </button>

        <button
          className={
            activeTab === "profile" &&
            selectedPlayerId === currentPlayer?.id
              ? "mobile-nav-active"
              : ""
          }
          onClick={openMyProfile}
        >
          <AppIcon name="user" size={20} />
          <small>Me</small>
        </button>
      </nav>

      {rankInfoMode && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setRankInfoMode(null);
            }
          }}
        >
          <div className="rank-info-modal">
            <div className="modal-heading">
              <div>
                <p className="season-label">RANKING GUIDE</p>
                <h2>How League Rating Is Determined</h2>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={() => setRankInfoMode(null)}
              >
                ×
              </button>
            </div>

            <div className="rank-explainer-copy">
              <p>
                <strong>The League Rating is inspired by the USATT player-rating system.</strong> Everyone begins at 1000. After each completed match, rating points move from the loser to the winner based on the rating gap entering the match.
              </p>

              <div className="rank-rule-grid">
                <div>
                  <strong>Beat a stronger player</strong>
                  <span>A bigger upset earns substantially more rating.</span>
                </div>
                <div>
                  <strong>Beat a weaker player</strong>
                  <span>An expected win earns only a small amount.</span>
                </div>
                <div>
                  <strong>Lose to a stronger player</strong>
                  <span>An expected loss costs only a small amount.</span>
                </div>
                <div>
                  <strong>Lose to a weaker player</strong>
                  <span>An upset loss costs substantially more.</span>
                </div>
                <div>
                  <strong>1–4 matches</strong>
                  <span>Provisional. Your rating is visible but you do not take an official rank.</span>
                </div>
                <div>
                  <strong>5+ matches</strong>
                  <span>Officially ranked and eligible for the top three placements.</span>
                </div>
              </div>

              <p className="rank-note">
                Match score margin does not change the League Rating. Point differential and game scores are still tracked as separate performance analytics. Strength of Schedule is the average rating of the opponents you have faced at the time you played them.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedMatch && selectedMatchAnalytics && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedMatch(null);
            }
          }}
        >
          <div className="match-detail-modal">
            <div className="modal-heading">
              <div>
                <p className="season-label">MATCH DETAILS</p>
                <h2>
                  {getPlayerName(selectedMatch.player_a_id)} vs. {getPlayerName(selectedMatch.player_b_id)}
                </h2>
                <p>
                  {new Date(selectedMatch.created_at).toLocaleString()} • {getFormatName(selectedMatch.format)}
                </p>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={() => setSelectedMatch(null)}
              >
                ×
              </button>
            </div>

            {(() => {
              const a = selectedMatchAnalytics.a;
              const b = selectedMatchAnalytics.b;
              const aWon =
                selectedMatchAnalytics.winnerId ===
                selectedMatch.player_a_id;
              const winnerAnalytics = aWon ? a : b;
              const upset = winnerAnalytics.expectedElo < 0.5;

              return (
                <>
                  <div className="match-detail-scoreboard">
                    <button
                      className={aWon ? "match-winner-name" : "match-loser-name"}
                      onClick={() => {
                        setSelectedMatch(null);
                        openPlayerProfile(selectedMatch.player_a_id);
                      }}
                    >
                      {getPlayerName(selectedMatch.player_a_id)}
                    </button>
                    <strong className={aWon ? "match-winner-name" : "match-loser-name"}>
                      {selectedMatchAnalytics.aGames}
                    </strong>
                    <span>–</span>
                    <strong className={!aWon ? "match-winner-name" : "match-loser-name"}>
                      {selectedMatchAnalytics.bGames}
                    </strong>
                    <button
                      className={!aWon ? "match-winner-name" : "match-loser-name"}
                      onClick={() => {
                        setSelectedMatch(null);
                        openPlayerProfile(selectedMatch.player_b_id);
                      }}
                    >
                      {getPlayerName(selectedMatch.player_b_id)}
                    </button>
                  </div>

                  {upset && (
                    <div className="upset-banner">
                      Upset Win: the winner entered with only {Math.round(winnerAnalytics.expectedElo * 100)}% expected win probability.
                    </div>
                  )}

                  <div className="match-game-detail-grid">
                    {(selectedMatch.games || []).map((game, index) => (
                      <div key={index}>
                        <span>Game {index + 1}</span>
                        <strong>{game.a} – {game.b}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="match-comparison-grid">
                    <div className="match-player-analysis">
                      <h3>{getPlayerName(selectedMatch.player_a_id)}</h3>
                      <div><span>Total Points</span><strong>{selectedMatchAnalytics.aPoints}</strong></div>
                      <div><span>Point +/-</span><strong>{formatSigned(a.pointDifferential)}</strong></div>
                      <div><span>League Rating</span><strong>{Math.round(a.eloBefore)} → {Math.round(a.eloAfter)} <small>{formatSigned(a.eloChange)}</small></strong></div>
                      <div><span>Expected Win</span><strong>{Math.round(a.expectedElo * 100)}%</strong></div>
                      <div><span>Points Won</span><strong>{Math.round(a.pointShare * 1000) / 10}%</strong></div>
                    </div>

                    <div className="match-player-analysis">
                      <h3>{getPlayerName(selectedMatch.player_b_id)}</h3>
                      <div><span>Total Points</span><strong>{selectedMatchAnalytics.bPoints}</strong></div>
                      <div><span>Point +/-</span><strong>{formatSigned(b.pointDifferential)}</strong></div>
                      <div><span>League Rating</span><strong>{Math.round(b.eloBefore)} → {Math.round(b.eloAfter)} <small>{formatSigned(b.eloChange)}</small></strong></div>
                      <div><span>Expected Win</span><strong>{Math.round(b.expectedElo * 100)}%</strong></div>
                      <div><span>Points Won</span><strong>{Math.round(b.pointShare * 1000) / 10}%</strong></div>
                    </div>
                  </div>

                  {canManageMatch(selectedMatch) && (
                    <div className="match-detail-actions">
                      <button
                        className="edit-button"
                        onClick={() => {
                          const match = selectedMatch;
                          setSelectedMatch(null);
                          openEditMatch(match);
                        }}
                      >
                        Edit Match
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {editingMatch && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              setEditingMatch(
                null
              );
            }
          }}
        >
          <div className="match-edit-modal">
            <div className="modal-heading">
              <div>
                <p className="season-label">
                  CORRECT MATCH
                </p>

                <h2>
                  Edit Match
                </h2>

                <p>
                  {getPlayerName(
                    editingMatch.player_a_id
                  )}{" "}
                  vs.{" "}
                  {getPlayerName(
                    editingMatch.player_b_id
                  )}
                </p>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={() =>
                  setEditingMatch(
                    null
                  )
                }
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                saveEditedMatch
              }
            >
              <label>
                Match Format
              </label>

              <select
                value={
                  editFormat
                }
                onChange={(e) =>
                  setEditFormat(
                    Number(
                      e.target
                        .value
                    )
                  )
                }
              >
                <option value={1}>
                  Single Game
                </option>

                <option value={3}>
                  Best of 3
                </option>

                <option value={5}>
                  Best of 5
                </option>
              </select>

              <div className="score-section edit-score-section">
                <div className="edit-score-heading">
                  <h3>
                    Game Scores
                  </h3>

                  <p>
                    Clear both score boxes on a row to remove that game.
                  </p>
                </div>

                {editGameScores
                  .slice(
                    0,
                    editFormat
                  )
                  .map(
                    (
                      game,
                      index
                    ) => (
                      <div
                        className="score-row"
                        key={
                          index
                        }
                      >
                        <strong>
                          Game{" "}
                          {index +
                            1}
                        </strong>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={
                            game.a
                          }
                          onChange={(
                            e
                          ) =>
                            updateEditGameScore(
                              index,
                              "a",
                              e
                                .target
                                .value
                            )
                          }
                        />

                        <span>
                          –
                        </span>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={
                            game.b
                          }
                          onChange={(
                            e
                          ) =>
                            updateEditGameScore(
                              index,
                              "b",
                              e
                                .target
                                .value
                            )
                          }
                        />
                      </div>
                    )
                  )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setEditingMatch(
                      null
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              </div>
            </form>

            <div className="modal-delete-area">
              <button
                type="button"
                className="delete-button"
                onClick={() =>
                  deleteMatch(
                    editingMatch.id
                  )
                }
              >
                Delete Entire Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
