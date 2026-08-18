import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabaseClient";

const APP_URL = `${window.location.origin}${import.meta.env.BASE_URL}`;

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

function calculateStandings(players, matches) {
  const stats = {};

  players.forEach((player) => {
    stats[player.id] = {
      ...player,
      rating: 1000,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
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

    a.gamesWon += aGames;
    a.gamesLost += bGames;

    b.gamesWon += bGames;
    b.gamesLost += aGames;

    a.pointsFor += aPoints;
    a.pointsAgainst += bPoints;

    b.pointsFor += bPoints;
    b.pointsAgainst += aPoints;

    const aWon = aGames > bGames;

    if (aWon) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }

    const expectedA =
      1 /
      (1 +
        Math.pow(
          10,
          (b.rating - a.rating) / 400
        ));

    const expectedB =
      1 /
      (1 +
        Math.pow(
          10,
          (a.rating - b.rating) / 400
        ));

    const resultA = aWon ? 1 : 0;
    const resultB = aWon ? 0 : 1;

    const k = 32;

    a.rating =
      a.rating +
      k * (resultA - expectedA);

    b.rating =
      b.rating +
      k * (resultB - expectedB);
  });

  return Object.values(stats)
    .map((player) => {
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

      const weightedWinPercentage =
        Math.round(
          ((player.wins + 3) /
            (matchesPlayed + 6)) *
            100
        );

      return {
        ...player,
        rating: Math.round(player.rating),
        matchesPlayed,
        gamesPlayed:
          player.gamesWon +
          player.gamesLost,
        winPercentage,
        weightedWinPercentage,
        pointDifferential:
          player.pointsFor -
          player.pointsAgainst,
      };
    })
    .sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }

      if (
        b.weightedWinPercentage !==
        a.weightedWinPercentage
      ) {
        return (
          b.weightedWinPercentage -
          a.weightedWinPercentage
        );
      }

      return (
        b.matchesPlayed -
        a.matchesPlayed
      );
    });
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

  const [playerA, setPlayerA] =
    useState("");

  const [playerB, setPlayerB] =
    useState("");

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
    setActiveTab("leaderboard");
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

  async function bootstrapAuthenticatedUser(
    userId
  ) {
    try {
      const list =
        await fetchMyLeagues();

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
        createName.trim();

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
        "create_league_v2",
        {
          p_league_name:
            cleanLeagueName,

          p_join_code:
            cleanCode,

          p_player_name:
            cleanPlayerName,
        }
      );

      if (error) throw error;

      setCreateLeagueName("");
      setCreateLeagueCode("");
      setCreateName("");

      const list =
        await fetchMyLeagues();

      const membership =
        list.find(
          (item) =>
            item.league_id ===
            newLeagueId
        );

      if (membership) {
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
        joinName.trim();

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
        data: playerId,
        error,
      } = await supabase.rpc(
        "join_league_v2",
        {
          p_join_code:
            cleanCode,

          p_player_name:
            cleanName,
        }
      );

      if (error) throw error;

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
    resetLeagueState();
    setHubMode("list");
    setErrorMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  const standings = useMemo(
    () =>
      calculateStandings(
        players,
        matches
      ),
    [players, matches]
  );

  const activeStandings =
    standings.filter(
      (player) =>
        player.is_active
    );

  const weightedStandings =
    [...activeStandings].sort(
      (a, b) => {
        if (
          b.weightedWinPercentage !==
          a.weightedWinPercentage
        ) {
          return (
            b.weightedWinPercentage -
            a.weightedWinPercentage
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

        return (
          b.rating - a.rating
        );
      }
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
    activeStandings[0];

  const isAdmin =
    currentPlayer?.member_role ===
      "admin" &&
    currentPlayer?.is_active;

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

  function changeTab(tab) {
    setErrorMessage("");
    setActiveTab(tab);

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

      setPlayerA("");
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
    const result =
      getMatchResult(match);

    const canManage =
      showManage &&
      canManageMatch(match);

    return (
      <div
        className="match-item"
        key={match.id}
      >
        <div className="match-main-copy">
          <small>
            {new Date(
              match.created_at
            ).toLocaleString()}{" "}
            •{" "}
            {getFormatName(
              match.format
            )}
          </small>

          <h3 className="history-player-line">
            <button
              onClick={() =>
                openPlayerProfile(
                  match.player_a_id
                )
              }
            >
              {getPlayerName(
                match.player_a_id
              )}
            </button>

            <strong>
              {result.aWins}
            </strong>

            <span>–</span>

            <strong>
              {result.bWins}
            </strong>

            <button
              onClick={() =>
                openPlayerProfile(
                  match.player_b_id
                )
              }
            >
              {getPlayerName(
                match.player_b_id
              )}
            </button>
          </h3>

          <div className="game-results">
            {(match.games || []).map(
              (
                game,
                index
              ) => (
                <span
                  key={
                    index
                  }
                >
                  G
                  {index +
                    1}
                  :{" "}
                  {
                    game.a
                  }
                  -
                  {
                    game.b
                  }
                </span>
              )
            )}
          </div>
        </div>

        {canManage && (
          <div className="match-actions">
            <button
              className="edit-button"
              onClick={() =>
                openEditMatch(
                  match
                )
              }
            >
              Edit Match
            </button>

            <button
              className="delete-button"
              onClick={() =>
                deleteMatch(
                  match.id
                )
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
          🏓
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

  if (
    authMode === "reset"
  ) {
    return (
      <div className="auth-page">
        <div className="auth-shell">
          <div className="auth-brand">
            <div className="auth-icon">
              🏓
            </div>

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
            <div className="auth-icon">
              🏓
            </div>

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
              <div className="brand-ball">
                🏓
              </div>

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
                              🏓
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
                    🏓
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
              <div className="brand-ball">
                🏓
              </div>
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
                {
                  league.join_code
                }{" "}
                📋
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
        </div>

        <nav>
          <button
            onClick={
              goToMyLeagues
            }
          >
            🏠 My Leagues
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
            🏆 Leaderboard
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
            🏓 Record Match
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
            👥 Players
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
            👤 My Profile
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
            🎮 My Matches
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
            📜 Match History
          </button>

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
              ⚙️ Admin
            </button>
          )}
        </nav>
      </header>

      {league.banner_url && (
        <div className="league-banner">
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
            "profile" && (
            <div className="league-description">
              {
                league.description
              }
            </div>
          )}

        {activeTab ===
          "leaderboard" && (
          <>
            <div className="page-heading-row">
              <div>
                <p className="season-label">
                  TABLE TALK LEAGUE
                </p>

                <h2>
                  Leaderboard
                </h2>

                <p>
                  See who's ruling the table.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() =>
                  changeTab(
                    "record"
                  )
                }
              >
                + Record Match
              </button>
            </div>

            <div className="stats">
              <div className="stat-card">
                <span>
                  Active Players
                </span>

                <strong>
                  {
                    activePlayers.length
                  }
                </strong>
              </div>

              <div className="stat-card">
                <span>
                  Matches Played
                </span>

                <strong>
                  {
                    matches.length
                  }
                </strong>
              </div>

              <div className="stat-card">
                <span>
                  Current Leader
                </span>

                <strong>
                  {leader
                    ? leader.name
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="card">
              <h3>
                🏆 Overall Elo Rankings
              </h3>

              <p>
                Rewards wins while also accounting for the strength of your opponent.
              </p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Rank
                      </th>

                      <th>
                        Player
                      </th>

                      <th>
                        Status
                      </th>

                      <th>
                        Elo
                      </th>

                      <th>
                        Record
                      </th>

                      <th>
                        Win %
                      </th>

                      <th>
                        Matches
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {activeStandings.map(
                      (
                        player,
                        index
                      ) => (
                        <tr
                          key={
                            player.id
                          }
                          className={
                            index === 0
                              ? "champion-row"
                              : ""
                          }
                        >
                          <td>
                            {index ===
                            0
                              ? "🥇"
                              : index ===
                                1
                              ? "🥈"
                              : index ===
                                2
                              ? "🥉"
                              : `#${
                                  index +
                                  1
                                }`}
                          </td>

                          <td>
                            <button
                              className="player-profile-link"
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
                                size="small"
                              />

                              <strong
                                className={
                                  index ===
                                  0
                                    ? "champion-text"
                                    : ""
                                }
                              >
                                {index ===
                                  0 &&
                                  "👑 "}
                                {
                                  player.name
                                }
                              </strong>
                            </button>
                          </td>

                          <td>
                            <StatusBadge
                              status={
                                player.play_status
                              }
                            />
                          </td>

                          <td>
                            <span
                              className={
                                index ===
                                0
                                  ? "champion-text"
                                  : ""
                              }
                            >
                              {
                                player.rating
                              }
                            </span>
                          </td>

                          <td>
                            <span
                              className={
                                index ===
                                0
                                  ? "champion-text"
                                  : ""
                              }
                            >
                              {
                                player.wins
                              }
                              -
                              {
                                player.losses
                              }
                            </span>
                          </td>

                          <td>
                            <span
                              className={
                                index ===
                                0
                                  ? "champion-text"
                                  : ""
                              }
                            >
                              {
                                player.winPercentage
                              }
                              %
                            </span>
                          </td>

                          <td>
                            <span
                              className={
                                index ===
                                0
                                  ? "champion-text"
                                  : ""
                              }
                            >
                              {
                                player.matchesPlayed
                              }
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card weighted-card">
              <h3>
                📊 Weighted Performance
              </h3>

              <p>
                Gives more credibility to strong records built over more matches.
              </p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Rank
                      </th>

                      <th>
                        Player
                      </th>

                      <th>
                        Record
                      </th>

                      <th>
                        Raw Win %
                      </th>

                      <th>
                        Matches
                      </th>

                      <th>
                        Weighted %
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {weightedStandings.map(
                      (
                        player,
                        index
                      ) => (
                        <tr
                          key={
                            player.id
                          }
                        >
                          <td>
                            {index ===
                            0
                              ? "🥇"
                              : index ===
                                1
                              ? "🥈"
                              : index ===
                                2
                              ? "🥉"
                              : `#${
                                  index +
                                  1
                                }`}
                          </td>

                          <td>
                            <button
                              className="player-profile-link"
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
                                size="small"
                              />

                              <strong>
                                {
                                  player.name
                                }
                              </strong>
                            </button>
                          </td>

                          <td>
                            {
                              player.wins
                            }
                            -
                            {
                              player.losses
                            }
                          </td>

                          <td>
                            {
                              player.winPercentage
                            }
                            %
                          </td>

                          <td>
                            {
                              player.matchesPlayed
                            }
                          </td>

                          <td>
                            <strong>
                              {
                                player.weightedWinPercentage
                              }
                              %
                            </strong>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab ===
          "record" && (
          <div className="card">
            <h2>
              🏓 Record a Match
            </h2>

            <p>
              Choose the players and enter each game's final score.
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

                  <select
                    value={
                      playerA
                    }
                    onChange={(e) =>
                      setPlayerA(
                        e.target
                          .value
                      )
                    }
                  >
                    <option value="">
                      Choose player
                    </option>

                    {activePlayers.map(
                      (
                        player
                      ) => (
                        <option
                          key={
                            player.id
                          }
                          value={
                            player.id
                          }
                        >
                          {player.play_status ===
                          "open"
                            ? "🟢 "
                            : ""}
                          {
                            player.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label>
                    Player 2
                  </label>

                  <select
                    value={
                      playerB
                    }
                    onChange={(e) =>
                      setPlayerB(
                        e.target
                          .value
                      )
                    }
                  >
                    <option value="">
                      Choose player
                    </option>

                    {activePlayers.map(
                      (
                        player
                      ) => (
                        <option
                          key={
                            player.id
                          }
                          value={
                            player.id
                          }
                        >
                          {player.play_status ===
                          "open"
                            ? "🟢 "
                            : ""}
                          {
                            player.name
                          }
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
                    🟢 Open to Play
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
                      Elo Rating
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
                          {
                            player.weightedWinPercentage
                          }
                          %
                        </strong>

                        <span>
                          Weighted
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
                  ELO RATING
                </span>

                <div className="profile-rank">
                  League Rank #
                  {activeStandings.findIndex(
                    (player) =>
                      player.id ===
                      selectedPlayer.id
                  ) + 1}
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
                  Weighted
                </span>

                <strong>
                  {
                    selectedStats.weightedWinPercentage
                  }
                  %
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
                  {selectedStats.pointDifferential >
                  0
                    ? "+"
                    : ""}
                  {
                    selectedStats.pointDifferential
                  }
                </strong>
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
                        🟢 Open to Play
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
                <h3>
                  ⚔️ Head-to-Head
                </h3>

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
                <h3>
                  🕒 Recent Matches
                </h3>

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
                    🏓
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
              📜 Match History
            </h2>

            <p>
              Complete league match history.
            </p>

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
                  ⚙️ Admin
                </h2>

                <p>
                  Customize and manage your league.
                </p>
              </div>
            </div>

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