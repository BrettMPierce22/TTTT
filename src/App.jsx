import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabaseClient";

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

  match.games.forEach((game) => {
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

    match.games.forEach((game) => {
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
  const [user, setUser] = useState(null);
  const [league, setLeague] = useState(null);
  const [currentPlayer, setCurrentPlayer] =
    useState(null);

  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const [setupMode, setSetupMode] =
    useState("join");

  const [joinName, setJoinName] =
    useState("");

  const [joinCode, setJoinCode] =
    useState("");

  const [createName, setCreateName] =
    useState("");

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
    leagueDescriptionDraft,
    setLeagueDescriptionDraft,
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
    initializeApp();
  }, []);

  useEffect(() => {
    if (!league?.id) return;

    const interval = setInterval(() => {
      loadLeagueData(
        league.id,
        user?.id
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
    setProfileDescriptionDraft(
      currentPlayer?.profile_description || ""
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
    currentPlayer?.profile_description,
    currentPlayer?.height_text,
    currentPlayer?.avg_ball_velocity,
  ]);

  async function initializeApp() {
    try {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      let activeSession = session;

      if (!activeSession) {
        const {
          data,
          error,
        } =
          await supabase.auth.signInAnonymously();

        if (error) throw error;

        activeSession = data.session;
      }

      const activeUser =
        activeSession?.user;

      if (!activeUser) {
        throw new Error(
          "Could not create your Table Talk Table Tennis session."
        );
      }

      setUser(activeUser);

      await findMembership(
        activeUser.id
      );
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Something went wrong while starting the app."
      );
    } finally {
      setLoading(false);
    }
  }

  async function findMembership(
    userId
  ) {
    const {
      data,
      error,
    } = await supabase
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
        play_status,
        profile_description,
        height_text,
        avg_ball_velocity,
        created_at
      `)
      .eq("user_id", userId)
      .order("created_at", {
        ascending: true,
      })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      setLeague(null);
      setCurrentPlayer(null);
      setPlayers([]);
      setMatches([]);
      return;
    }

    const membership = data[0];

    setCurrentPlayer(membership);

    await loadLeagueData(
      membership.league_id,
      userId
    );
  }

  async function loadLeagueData(
    leagueId,
    currentUserId = user?.id
  ) {
    try {
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

      setLeague(
        leagueResult.data
      );

      setPlayers(
        loadedPlayers
      );

      setMatches(
        matchesResult.data || []
      );

      if (currentUserId) {
        const me =
          loadedPlayers.find(
            (player) =>
              player.user_id ===
              currentUserId
          );

        if (me) {
          setCurrentPlayer(me);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function createLeague(
    event
  ) {
    event.preventDefault();

    if (!user) return;

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
          "Enter your name."
        );
      }

      if (!cleanCode) {
        throw new Error(
          "Create a league code."
        );
      }

      const { error } =
        await supabase.rpc(
          "create_league",
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

      await findMembership(
        user.id
      );

      setActiveTab(
        "leaderboard"
      );
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

    if (!user) return;

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
          "Enter your name."
        );
      }

      if (!cleanCode) {
        throw new Error(
          "Enter the league code."
        );
      }

      const { error } =
        await supabase.rpc(
          "join_league",
          {
            p_join_code:
              cleanCode,
            p_player_name:
              cleanName,
          }
        );

      if (error) throw error;

      await findMembership(
        user.id
      );

      setActiveTab(
        "leaderboard"
      );
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
    if (matchFormat === 1) {
      return "Single Game";
    }

    if (matchFormat === 3) {
      return "Best of 3";
    }

    if (matchFormat === 5) {
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

  function changeTab(tab) {
    setErrorMessage("");
    setActiveTab(tab);

    if (tab !== "profile") {
      setSelectedPlayerId(null);
    }
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
          "update_my_player_profile",
          {
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

    try {
      setProfileSaving(true);

      const { error } =
        await supabase.rpc(
          "update_my_player_profile",
          {
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
      !league
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
        "update_my_avatar",
        {
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
        gameScores
          .slice(0, format)
          .filter(
            (game) =>
              game.a !== "" &&
              game.b !== ""
          )
          .map((game) => ({
            a: Number(
              game.a
            ),
            b: Number(
              game.b
            ),
          }));

      if (
        usableGames.length ===
        0
      ) {
        throw new Error(
          "Enter the game score."
        );
      }

      if (
        usableGames.some(
          (game) =>
            game.a === game.b
        )
      ) {
        throw new Error(
          "Games cannot end in a tie."
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

      usableGames.forEach(
        (game) => {
          if (
            game.a >
            game.b
          ) {
            aWins++;
          } else {
            bWins++;
          }
        }
      );

      if (
        Math.max(
          aWins,
          bWins
        ) < winsNeeded
      ) {
        throw new Error(
          format === 1
            ? "Enter the final score."
            : `A Best of ${format} match needs a player to win ${winsNeeded} games.`
        );
      }

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

  async function deleteMatch(
    matchId
  ) {
    if (!league) return;

    const confirmed =
      window.confirm(
        "Delete this match? The leaderboard will be recalculated."
      );

    if (!confirmed) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from("matches")
          .delete()
          .eq(
            "id",
            matchId
          );

      if (error) throw error;

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
          "admin_rename_player",
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
        `Remove ${player.name} from the active league?\n\nTheir match history will NOT be deleted.`
      );

    if (!confirmed) return;

    try {
      const { error } =
        await supabase.rpc(
          "admin_remove_player",
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
          "admin_restore_player",
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
        `This permanently deletes "${league.name}", every player, and every match.\n\nType the exact league name to confirm:`
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

      setLeague(null);
      setCurrentPlayer(null);
      setPlayers([]);
      setMatches([]);
      setActiveTab(
        "leaderboard"
      );

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
          Loading the league...
        </p>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="welcome-page">
        <div className="welcome-shell">
          <div className="welcome-brand">
            <div className="welcome-icon">
              🏓
            </div>

            <h1>
              Table Talk Table Tennis
            </h1>

            <p>
              Office Table Tennis League
            </p>
          </div>

          <div className="welcome-card">
            <div className="setup-toggle">
              <button
                className={
                  setupMode ===
                  "join"
                    ? "setup-active"
                    : ""
                }
                onClick={() =>
                  setSetupMode(
                    "join"
                  )
                }
              >
                Join League
              </button>

              <button
                className={
                  setupMode ===
                  "create"
                    ? "setup-active"
                    : ""
                }
                onClick={() =>
                  setSetupMode(
                    "create"
                  )
                }
              >
                Create League
              </button>
            </div>

            {setupMode ===
            "join" ? (
              <form
                onSubmit={
                  joinLeague
                }
              >
                <h2>
                  Join a League
                </h2>

                <label>
                  Your Name
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
                  placeholder="Brett"
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
                  placeholder="TLDGR26"
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
                    ? "Joining..."
                    : "Join League"}
                </button>
              </form>
            ) : (
              <form
                onSubmit={
                  createLeague
                }
              >
                <h2>
                  Create a League
                </h2>

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
                  placeholder="Table Talk Table Tennis"
                />

                <label>
                  Your Name
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
                  placeholder="Brett"
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
                  placeholder="TLDGR26"
                />

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
            )}
          </div>
        </div>
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
        </div>

        <nav>
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
          "history" && (
          <div className="card">
            <h2>
              📜 Match History
            </h2>

            {matches.length ===
            0 ? (
              <p>
                No matches yet.
              </p>
            ) : (
              <div className="match-list">
                {matches.map(
                  (match) => {
                    const result =
                      getMatchResult(
                        match
                      );

                    const canDelete =
                      match.created_by ===
                        user?.id ||
                      isAdmin;

                    return (
                      <div
                        className="match-item"
                        key={
                          match.id
                        }
                      >
                        <div>
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
                              {
                                result.aWins
                              }
                            </strong>

                            <span>
                              –
                            </span>

                            <strong>
                              {
                                result.bWins
                              }
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
                            {match.games.map(
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

                        {canDelete && (
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
                        )}
                      </div>
                    );
                  }
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
                  Removed Players
                </h3>

                {removedPlayers.map(
                  (player) => (
                    <div
                      className="admin-player-row"
                      key={
                        player.id
                      }
                    >
                      <strong>
                        {
                          player.name
                        }
                      </strong>

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
    </div>
  );
}

export default App;