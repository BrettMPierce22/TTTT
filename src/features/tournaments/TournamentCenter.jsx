import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTournamentMatches, createId, shuffle } from "./brackets";
import { canRecordTournamentMatch, validateTournamentScore } from "./matchRules";
import { loadTournamentMatches } from "./loadMatches";
import { supabase } from "../../lib/supabaseClient";
import "./TournamentCenter.css";

const EMPTY_FORM = {
  name: "",
  description: "",
  format: "single_elimination",
  seedingMethod: "rating",
  bestOf: "5",
  includeThirdPlace: true,
  grandFinalReset: true,
};


function formatLabel(value) {
  return {
    single_elimination: "Single elimination",
    double_elimination: "Double elimination",
    round_robin: "Round robin",
  }[value] || value;
}

function statusLabel(value) {
  return {
    draft: "Draft",
    active: "Live",
    complete: "Final",
    cancelled: "Cancelled",
  }[value] || value;
}

function entrantName(entry) {
  return entry?.player?.name || entry?.guest_name || "TBD";
}

function TournamentCenter({ league, currentPlayer, players, isAdmin }) {
  const requestVersion = useRef(0);
  const viewVersion = useRef(0);
  const actionBusy = useRef(false);
  const leagueId = league?.id;
  const [tournaments, setTournaments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedEntrants, setSelectedEntrants] = useState([]);
  const [guestName, setGuestName] = useState("");
  const [scoreMatch, setScoreMatch] = useState(null);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");

  const activePlayers = useMemo(
    () => players.filter((player) => player.is_active),
    [players]
  );

  const loadData = useCallback(async () => {
    if (!leagueId) return;
    const version = ++requestVersion.current;
    const isCurrent = () => requestVersion.current === version;
    setLoading(true);
    setErrorMessage("");
    // Never leave an old tournament's score controls live while loading another.
    setEntries([]);
    setMatches([]);
    try {
    const tournamentResult = await supabase
      .from("tournaments")
      .select("*")
      .eq("league_id", leagueId)
      .order("created_at", { ascending: false });
    if (!isCurrent()) return;

    if (tournamentResult.error) {
      console.error("Could not load tournaments", tournamentResult.error);
      setErrorMessage(
        tournamentResult.error.code === "42P01" || tournamentResult.error.code === "PGRST205"
          ? "The tournament database setup still needs to be installed in Supabase."
          : "The tournament center could not be loaded."
      );
      setLoading(false);
      return;
    }

    const list = tournamentResult.data || [];
    setTournaments(list);
    const nextSelectedId =
      selectedId && list.some((item) => item.id === selectedId)
        ? selectedId
        : null;
    setSelectedId(nextSelectedId);

    if (!nextSelectedId) {
      setEntries([]);
      setMatches([]);
      setLoading(false);
      return;
    }

    const [entryResult, matchRows] = await Promise.all([
      supabase
        .from("tournament_entries")
        .select("*, player:players(id,name,avatar_url,is_active)")
        .eq("tournament_id", nextSelectedId)
        .order("seed"),
      loadTournamentMatches(supabase, nextSelectedId, isCurrent),
    ]);
    if (!isCurrent()) return;
    if (entryResult.error) {
      console.error(entryResult.error);
      setErrorMessage("The tournament bracket could not be loaded.");
    } else {
      setEntries(entryResult.data || []);
      setMatches(matchRows);
    }
    setLoading(false);
    } catch {
      if (isCurrent()) { setErrorMessage("The tournament center could not be loaded. Please try again."); setLoading(false); }
    }
  }, [leagueId, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(), 0);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; viewVersion.current += 1; };
  }, [loadData]);

  const selectedTournament = tournaments.find((item) => item.id === selectedId) || null;
  const currentTournaments = useMemo(
    () => tournaments.filter((item) => item.status === "draft" || item.status === "active"),
    [tournaments]
  );
  const pastTournaments = useMemo(
    () => tournaments.filter((item) => item.status === "complete" || item.status === "cancelled"),
    [tournaments]
  );
  const canManage = Boolean(
    selectedTournament &&
      (isAdmin || selectedTournament.created_by_player_id === currentPlayer?.id)
  );
  const entryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries]
  );

  const roundRobinStandings = useMemo(() => {
    if (selectedTournament?.format !== "round_robin") return [];
    const rows = new Map(
      entries.map((entry) => [
        entry.id,
        { entry, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0 },
      ])
    );
    matches.filter((match) => match.status === "complete").forEach((match) => {
      const a = rows.get(match.player_a_entry_id);
      const b = rows.get(match.player_b_entry_id);
      if (!a || !b) return;
      a.gamesFor += Number(match.score_a || 0);
      a.gamesAgainst += Number(match.score_b || 0);
      b.gamesFor += Number(match.score_b || 0);
      b.gamesAgainst += Number(match.score_a || 0);
      if (match.winner_entry_id === a.entry.id) {
        a.wins += 1;
        b.losses += 1;
      } else {
        b.wins += 1;
        a.losses += 1;
      }
    });
    return [...rows.values()].sort(
      (a, b) =>
        b.wins - a.wins ||
        // Match the existing server's championship tie-break: wins, then seed.
        a.entry.seed - b.entry.seed
    );
  }, [entries, matches, selectedTournament?.format]);

  function togglePlayer(player) {
    setSelectedEntrants((current) => {
      const key = `player:${player.id}`;
      if (current.some((item) => item.key === key)) {
        return current.filter((item) => item.key !== key);
      }
      return [
        ...current,
        {
          key,
          playerId: player.id,
          guestName: null,
          name: player.name,
          rating: Number(player.rating || 1000),
        },
      ];
    });
  }

  function addGuest() {
    const cleanName = guestName.trim();
    if (!cleanName) return;
    setSelectedEntrants((current) => [
      ...current,
      {
        key: `guest:${createId()}`,
        playerId: null,
        guestName: cleanName,
        name: cleanName,
        rating: 0,
      },
    ]);
    setGuestName("");
  }

  function moveEntrant(index, direction) {
    setSelectedEntrants((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function createTournament(event) {
    event.preventDefault();
    if (actionBusy.current) return;
    if (selectedEntrants.length < 2) {
      setErrorMessage("Choose at least two entrants.");
      return;
    }
    if (form.format === "double_elimination" && selectedEntrants.length < 3) {
      setErrorMessage("Double elimination needs at least three entrants.");
      return;
    }
    let seeded = [...selectedEntrants];
    if (form.seedingMethod === "rating") {
      seeded.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    } else if (form.seedingMethod === "random") {
      seeded = shuffle(seeded);
    }
    const payload = seeded.map((entry, index) => ({
      id: createId(),
      player_id: entry.playerId,
      guest_name: entry.guestName,
      seed: index + 1,
    }));

    actionBusy.current = true;
    const view = viewVersion.current;
    try {
      setSaving(true);
      setErrorMessage("");
      const { data, error } = await supabase.rpc("create_tournament", {
        p_league_id: league.id,
        p_name: form.name.trim(),
        p_description: form.description.trim() || null,
        p_format: form.format,
        p_seeding_method: form.seedingMethod,
        p_best_of: Number(form.bestOf),
        p_include_third_place:
          form.format === "single_elimination" && form.includeThirdPlace,
        p_grand_final_reset:
          form.format === "double_elimination" && form.grandFinalReset,
        p_entries: payload,
      });
      if (view !== viewVersion.current) return;
      if (error) throw error;
      setSelectedId(data);
      setDetailTab("overview");
      setForm(EMPTY_FORM);
      setSelectedEntrants([]);
      setShowCreate(false);
      setNotice("Tournament draft created. Review the seeds, then start the bracket.");
    } catch (error) {
      if (view !== viewVersion.current) return;
      console.error(error);
      setErrorMessage(error.message || "Could not create the tournament.");
    } finally {
      actionBusy.current = false;
      setSaving(false);
    }
  }

  async function startTournament() {
    if (!selectedTournament || entries.length < 2 || actionBusy.current) return;
    const confirmed = window.confirm(
      `Start ${selectedTournament.name}? Seeds and format lock when the bracket starts.`
    );
    if (!confirmed) return;
    actionBusy.current = true;
    const view = viewVersion.current;
    try {
      setSaving(true);
      const generatedMatches = buildTournamentMatches(selectedTournament, entries);
      const { error } = await supabase.rpc("start_tournament", {
        p_tournament_id: selectedTournament.id,
        p_matches: generatedMatches,
      });
      if (view !== viewVersion.current) return;
      if (error) throw error;
      setNotice("Tournament started. The bracket is live.");
      await loadData();
    } catch (error) {
      if (view !== viewVersion.current) return;
      console.error(error);
      setErrorMessage(error.message || "Could not start the tournament.");
    } finally {
      actionBusy.current = false;
      setSaving(false);
    }
  }

  async function saveScore(event, byeWinner = false) {
    event?.preventDefault?.();
    if (!scoreMatch || actionBusy.current) return;
    actionBusy.current = true;
    const view = viewVersion.current;
    try {
      setSaving(true);
      if (selectedTournament?.status !== "active") throw new Error("This tournament is not active.");
      if (!canRecordTournamentMatch(scoreMatch, matches)) throw new Error("Wait for the earlier matches to finish before recording this result.");
      const scores = byeWinner ? [0, 0] : validateTournamentScore(selectedTournament.best_of, scoreA, scoreB);
      if (byeWinner && Boolean(scoreMatch.player_a_entry_id) === Boolean(scoreMatch.player_b_entry_id)) throw new Error("This match is not a bye.");
      const { error } = await supabase.rpc("record_tournament_match", {
        p_match_id: scoreMatch.id,
        p_score_a: scores[0],
        p_score_b: scores[1],
        p_game_scores: [],
      });
      if (view !== viewVersion.current) return;
      if (error) throw error;
      setScoreMatch(null);
      setScoreA("");
      setScoreB("");
      setNotice("Score saved and the bracket advanced.");
      await loadData();
    } catch (error) {
      if (view !== viewVersion.current) return;
      console.error(error);
      setErrorMessage(error.message || "Could not record that score.");
    } finally {
      actionBusy.current = false;
      setSaving(false);
    }
  }

  async function cancelTournament() {
    if (!selectedTournament || actionBusy.current) return;
    if (!window.confirm(`Cancel ${selectedTournament.name}?`)) return;
    actionBusy.current = true;
    const view = viewVersion.current;
    try {
      setSaving(true);
      const { error } = await supabase.rpc("cancel_tournament", {
        p_tournament_id: selectedTournament.id,
      });
      if (view !== viewVersion.current) return;
      if (error) throw error;
      setNotice("Tournament cancelled.");
      await loadData();
    } catch (error) {
      if (view !== viewVersion.current) return;
      setErrorMessage(error.message || "Could not cancel the tournament.");
    } finally {
      actionBusy.current = false;
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (!selectedTournament || selectedTournament.status !== "draft" || actionBusy.current) return;
    if (!window.confirm(`Delete the draft “${selectedTournament.name}”?`)) return;
    actionBusy.current = true;
    const view = viewVersion.current;
    setSaving(true);
    try {
    const { error } = await supabase.from("tournaments").delete().eq("id", selectedTournament.id);
    if (view !== viewVersion.current) return;
    if (error) throw error;
    setSelectedId(null);
    } catch (error) {
      if (view === viewVersion.current) setErrorMessage(error.message || "Could not delete the draft.");
    } finally { actionBusy.current = false; setSaving(false); }
  }

  function openTournament(tournamentId) {
    requestVersion.current += 1;
    viewVersion.current += 1;
    setEntries([]);
    setMatches([]);
    setScoreMatch(null);
    setSelectedId(tournamentId);
    setDetailTab("overview");
    setShowCreate(false);
    setNotice("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeTournament() {
    requestVersion.current += 1;
    viewVersion.current += 1;
    setSelectedId(null);
    setDetailTab("overview");
    setEntries([]);
    setMatches([]);
    setScoreMatch(null);
    setNotice("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderTournamentCard(tournament, group) {
    return (
      <button
        type="button"
        className={`tournament-library-card tournament-library-card-${group}`}
        key={tournament.id}
        onClick={() => openTournament(tournament.id)}
      >
        <div className="tournament-library-card-top">
          <span className={`tournament-status tournament-status-${tournament.status}`}>
            {statusLabel(tournament.status)}
          </span>
          <span className="tournament-card-arrow" aria-hidden="true">→</span>
        </div>
        <strong>{tournament.name}</strong>
        <p>{tournament.description || `${formatLabel(tournament.format)} tournament`}</p>
        <small>{formatLabel(tournament.format)} · Best of {tournament.best_of}</small>
      </button>
    );
  }

  function renderMatch(match) {
    const playerA = entryById.get(match.player_a_entry_id);
    const playerB = entryById.get(match.player_b_entry_id);
    const participantCanReport = [playerA?.player_id, playerB?.player_id].includes(
      currentPlayer?.id
    );
    const oneEntrant = Boolean(playerA) !== Boolean(playerB);
    return (
      <article className={`tournament-match tournament-match-${match.status}`} key={match.id}>
        <div className="tournament-match-label">
          <span>{match.label}</span>
          <small>Match {match.match_number}</small>
        </div>
        {[playerA, playerB].map((entry, index) => {
          const isWinner = match.winner_entry_id === entry?.id;
          const score = index === 0 ? match.score_a : match.score_b;
          return (
            <div className={`tournament-match-player ${isWinner ? "match-player-winner" : ""}`} key={index}>
              <span className="tournament-seed">{entry ? entry.seed : "—"}</span>
              <strong>{entrantName(entry)}</strong>
              <b>{score ?? ""}</b>
            </div>
          );
        })}
        {selectedTournament.status === "active" && match.status === "scheduled" && (canManage || participantCanReport) && (
          <button
            type="button"
            className="tournament-score-button"
            disabled={saving || !canRecordTournamentMatch(match, matches)}
            onClick={() => {
              setErrorMessage("");
              setScoreMatch(match);
              setScoreA("");
              setScoreB("");
            }}
          >
            {!canRecordTournamentMatch(match, matches) ? "Waiting" : oneEntrant ? "Advance bye" : "Record score"}
          </button>
        )}
      </article>
    );
  }

  function renderBracket() {
    if (matches.length === 0) return null;
    const bracketSections = ["winners", "losers", "grand_final", "third_place"]
      .map((bracket) => ({ bracket, list: matches.filter((match) => match.bracket === bracket) }))
      .filter((section) => section.list.length > 0);
    return bracketSections.map((section) => {
      const rounds = [...new Set(section.list.map((match) => match.round_number))];
      const title = {
        winners: selectedTournament.format === "single_elimination" ? "Championship Bracket" : "Winners Bracket",
        losers: "Elimination Bracket",
        grand_final: "Championship",
        third_place: "Placement Match",
      }[section.bracket];
      return (
        <section className={`tournament-bracket-section tournament-bracket-section-${section.bracket}`} key={section.bracket}>
          <div className="tournament-section-heading">
            <p className="season-label">LIVE BRACKET</p>
            <h3>{title}</h3>
          </div>
          <div className="tournament-rounds">
            {rounds.map((round) => {
              const roundMatches = section.list.filter((match) => match.round_number === round);
              return (
                <div className="tournament-round" key={round}>
                  <h4>{roundMatches[0]?.label || `Round ${round}`}</h4>
                  <div className="tournament-round-matches">{roundMatches.map(renderMatch)}</div>
                </div>
              );
            })}
          </div>
        </section>
      );
    });
  }

  if (loading && tournaments.length === 0) {
    return <div className="card tournament-empty">Loading tournaments…</div>;
  }

  return (
    <div className="tournament-center">
      <div className="tournament-hero">
        <div>
          <p className="season-label">COMPETE</p>
          <h2>Tournament Center</h2>
          <p>Choose a tournament to view its details, players, and bracket.</p>
        </div>
        <button
          type="button"
          className={`tournament-create-trigger ${showCreate ? "tournament-create-trigger-active" : ""}`}
          aria-label={showCreate ? "Close new tournament form" : "Create a new tournament"}
          aria-expanded={showCreate}
          disabled={saving}
          onClick={() => {
            viewVersion.current += 1;
            requestVersion.current += 1;
            setSelectedId(null);
            setDetailTab("overview");
            setShowCreate((current) => !current);
          }}
        >
          <span aria-hidden="true">{showCreate ? "×" : "+"}</span>
        </button>
      </div>

      {errorMessage && !scoreMatch && <div className="tournament-alert tournament-alert-error" role="alert">{errorMessage} <button type="button" className="secondary-button" disabled={saving || loading} onClick={loadData}>Refresh tournaments</button></div>}
      {notice && <div className="tournament-alert tournament-alert-success">{notice}</div>}

      {showCreate && (
        <form className="card tournament-create" onSubmit={createTournament}>
          <div className="tournament-section-heading">
            <p className="season-label">NEW EVENT</p>
            <h3>Build your tournament</h3>
          </div>
          <div className="tournament-form-grid">
            <label>
              Tournament name
              <input
                required
                minLength="3"
                maxLength="100"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Saturday Night Championship"
              />
            </label>
            <label>
              Format
              <select
                value={form.format}
                onChange={(event) => setForm({ ...form, format: event.target.value })}
              >
                <option value="single_elimination">Single elimination</option>
                <option value="double_elimination">Double elimination</option>
                <option value="round_robin">Round robin</option>
              </select>
            </label>
            <label>
              Seeding
              <select
                value={form.seedingMethod}
                onChange={(event) => setForm({ ...form, seedingMethod: event.target.value })}
              >
                <option value="rating">League rating</option>
                <option value="random">Random draw</option>
                <option value="manual">Manual order below</option>
              </select>
            </label>
            <label>
              Match format
              <select
                value={form.bestOf}
                onChange={(event) => setForm({ ...form, bestOf: event.target.value })}
              >
                {[1, 3, 5, 7].map((value) => (
                  <option value={value} key={value}>Best of {value}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              rows="3"
              maxLength="800"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Rules, location, start time, or prize details…"
            />
          </label>
          <div className="tournament-options">
            {form.format === "single_elimination" && (
              <label className="tournament-option-toggle">
                <input type="checkbox" checked={form.includeThirdPlace} onChange={(event) => setForm({ ...form, includeThirdPlace: event.target.checked })} />
                <span className="tournament-option-switch" aria-hidden="true"><span /></span>
                <span className="tournament-option-copy"><strong>Third-place match</strong><small>Add a placement match for the semifinalists.</small></span>
              </label>
            )}
            {form.format === "double_elimination" && (
              <label className="tournament-option-toggle">
                <input type="checkbox" checked={form.grandFinalReset} onChange={(event) => setForm({ ...form, grandFinalReset: event.target.checked })} />
                <span className="tournament-option-switch" aria-hidden="true"><span /></span>
                <span className="tournament-option-copy"><strong>Championship reset</strong><small>Require a second final if the unbeaten finalist loses.</small></span>
              </label>
            )}
          </div>

          <div className="tournament-entrant-builder">
            <div className="tournament-section-heading">
              <p className="season-label">FIELD</p>
              <h3>Choose entrants</h3>
            </div>
            <div className="tournament-player-picker">
              {activePlayers.map((player) => {
                const checked = selectedEntrants.some((item) => item.key === `player:${player.id}`);
                return (
                  <button type="button" className={checked ? "entrant-picker-selected" : ""} key={player.id} onClick={() => togglePlayer(player)}>
                    <span>{checked ? "✓" : "+"}</span>
                    <strong>{player.name}</strong>
                    <small>{player.rating || 1000}</small>
                  </button>
                );
              })}
            </div>
            <div className="tournament-guest-row">
              <input value={guestName} maxLength="80" onChange={(event) => setGuestName(event.target.value)} placeholder="Guest player name" />
              <button type="button" className="secondary-button" onClick={addGuest}>Add guest</button>
            </div>
            <div className="tournament-seed-list">
              {selectedEntrants.map((entrant, index) => (
                <div key={entrant.key}>
                  <span>{index + 1}</span>
                  <strong>{entrant.name}</strong>
                  <div>
                    <button type="button" onClick={() => moveEntrant(index, -1)} disabled={index === 0}>↑</button>
                    <button type="button" onClick={() => moveEntrant(index, 1)} disabled={index === selectedEntrants.length - 1}>↓</button>
                    <button type="button" onClick={() => setSelectedEntrants((current) => current.filter((item) => item.key !== entrant.key))}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="tournament-form-actions">
            <button type="button" className="secondary-button" disabled={saving} onClick={() => { viewVersion.current += 1; setShowCreate(false); }}>Cancel</button>
            <button className="primary-button" disabled={saving || selectedEntrants.length < 2}>{saving ? "Creating…" : "Create Draft"}</button>
          </div>
        </form>
      )}

      {!selectedTournament ? (
        <div className="tournament-library">
          {tournaments.length === 0 ? (
            <div className="card tournament-empty">
              <strong>No tournaments yet</strong>
              <p>Tap the glass + to create the first tournament for {league.name}.</p>
            </div>
          ) : (
            <>
              <section className="tournament-library-section tournament-library-current">
                <div className="tournament-library-heading">
                  <div>
                    <p className="season-label">NOW</p>
                    <h3>Current Tournaments</h3>
                  </div>
                  <span>{currentTournaments.length}</span>
                </div>
                {currentTournaments.length > 0 ? (
                  <div className="tournament-library-grid">
                    {currentTournaments.map((tournament) => renderTournamentCard(tournament, "current"))}
                  </div>
                ) : (
                  <div className="tournament-library-placeholder">No current tournaments.</div>
                )}
              </section>

              <section className="tournament-library-section tournament-library-past">
                <div className="tournament-library-heading">
                  <div>
                    <p className="season-label">ARCHIVE</p>
                    <h3>Past Tournaments</h3>
                  </div>
                  <span>{pastTournaments.length}</span>
                </div>
                {pastTournaments.length > 0 ? (
                  <div className="tournament-library-grid">
                    {pastTournaments.map((tournament) => renderTournamentCard(tournament, "past"))}
                  </div>
                ) : (
                  <div className="tournament-library-placeholder">Completed tournaments will appear here.</div>
                )}
              </section>
            </>
          )}
        </div>
      ) : (
        <div className="tournament-detail">
          <div className="tournament-detail-toolbar">
            <button type="button" className="tournament-back-button" onClick={closeTournament}>
              <span aria-hidden="true">‹</span>
              All Tournaments
            </button>
            <span className={`tournament-status tournament-status-${selectedTournament.status}`}>
              {statusLabel(selectedTournament.status)}
            </span>
          </div>

          <div className="tournament-detail-title">
            <div>
              <p className="season-label">{formatLabel(selectedTournament.format)}</p>
              <h2>{selectedTournament.name}</h2>
              <p>{selectedTournament.description || `${entries.length}-player tournament for ${league.name}.`}</p>
            </div>
          </div>

          <div className="tournament-detail-tabs" role="tablist" aria-label="Tournament sections">
            <button
              type="button"
              role="tab"
              aria-selected={detailTab === "overview"}
              className={detailTab === "overview" ? "tournament-detail-tab-active" : ""}
              onClick={() => setDetailTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={detailTab === "bracket"}
              className={detailTab === "bracket" ? "tournament-detail-tab-active" : ""}
              onClick={() => setDetailTab("bracket")}
            >
              {selectedTournament.format === "round_robin" ? "Matches" : "Bracket"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={detailTab === "players"}
              className={detailTab === "players" ? "tournament-detail-tab-active" : ""}
              onClick={() => setDetailTab("players")}
            >
              Players
            </button>
          </div>

          {detailTab === "overview" && (
            <div className="tournament-detail-panel tournament-overview-panel">
              <div className="tournament-overview-stats">
                <div><small>Status</small><strong>{statusLabel(selectedTournament.status)}</strong></div>
                <div><small>Players</small><strong>{entries.length}</strong></div>
                <div><small>Matches</small><strong>{matches.length}</strong></div>
                <div><small>Format</small><strong>Best of {selectedTournament.best_of}</strong></div>
              </div>

              {selectedTournament.winner_entry_id && (
                <div className="tournament-champion">
                  <span>🏆 CHAMPION</span>
                  <strong>{entrantName(entryById.get(selectedTournament.winner_entry_id))}</strong>
                </div>
              )}

              {selectedTournament.format === "round_robin" && matches.length > 0 && (
                <div className="card tournament-standings">
                  <div className="tournament-section-heading"><p className="season-label">TABLE</p><h3>Standings</h3></div>
                  {roundRobinStandings.map((row, index) => (
                    <div className="tournament-standing-row" key={row.entry.id}>
                      <span>{index + 1}</span><strong>{entrantName(row.entry)}</strong><b>{row.wins}-{row.losses}</b><small>{row.gamesFor - row.gamesAgainst >= 0 ? "+" : ""}{row.gamesFor - row.gamesAgainst}</small>
                    </div>
                  ))}
                </div>
              )}

              <div className="tournament-detail-actions">
                {canManage && selectedTournament.status === "draft" && (
                  <>
                    <button type="button" className="primary-button" disabled={saving} onClick={startTournament}>Start Tournament</button>
                    <button type="button" className="secondary-button" onClick={deleteDraft}>Delete Draft</button>
                  </>
                )}
                {canManage && selectedTournament.status === "active" && (
                  <button type="button" className="secondary-button" onClick={cancelTournament}>Cancel Tournament</button>
                )}
              </div>
            </div>
          )}

          {detailTab === "bracket" && (
            <div className="tournament-detail-panel">
              {matches.length === 0 ? (
                <div className="card tournament-empty tournament-bracket-empty">
                  <strong>No bracket yet</strong>
                  <p>The bracket will appear here after this tournament starts.</p>
                  {canManage && selectedTournament.status === "draft" && (
                    <button type="button" className="primary-button" disabled={saving} onClick={startTournament}>Start Tournament</button>
                  )}
                </div>
              ) : selectedTournament.format === "round_robin" ? (
                <div className="tournament-schedule">{matches.map(renderMatch)}</div>
              ) : (
                renderBracket()
              )}
            </div>
          )}

          {detailTab === "players" && (
            <div className="card tournament-detail-panel tournament-players-panel">
              <div className="tournament-section-heading">
                <p className="season-label">FIELD</p>
                <h3>{entries.length} Players</h3>
              </div>
              <div className="tournament-entry-grid">
                {entries.map((entry) => (
                  <div key={entry.id}>
                    <span>{entry.seed}</span>
                    <strong>{entrantName(entry)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {scoreMatch && (
        <div className="tournament-score-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setScoreMatch(null); }}>
          <form className="tournament-score-modal" onSubmit={saveScore}>
            {errorMessage && <p role="alert">{errorMessage}</p>}
            <p className="season-label">MATCH RESULT</p>
            <h3>{entrantName(entryById.get(scoreMatch.player_a_entry_id))} vs. {entrantName(entryById.get(scoreMatch.player_b_entry_id))}</h3>
            {Boolean(scoreMatch.player_a_entry_id) !== Boolean(scoreMatch.player_b_entry_id) ? (
              <button className="primary-button" type="button" disabled={saving} onClick={(event) => saveScore(event, true)}>Advance the available entrant</button>
            ) : (
              <div className="tournament-score-inputs">
                <label>{entrantName(entryById.get(scoreMatch.player_a_entry_id))}<input type="number" min="0" max="99" required value={scoreA} onChange={(event) => setScoreA(event.target.value)} /></label>
                <span>–</span>
                <label>{entrantName(entryById.get(scoreMatch.player_b_entry_id))}<input type="number" min="0" max="99" required value={scoreB} onChange={(event) => setScoreB(event.target.value)} /></label>
              </div>
            )}
            <div className="tournament-form-actions">
              <button type="button" className="secondary-button" onClick={() => setScoreMatch(null)}>Close</button>
              {scoreMatch.player_a_entry_id && scoreMatch.player_b_entry_id && <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save Result"}</button>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default TournamentCenter;
