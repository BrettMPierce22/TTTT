import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { buildOrganizerReport, createReportCsv, reportFilename } from "./reports";
import { shareReport } from "./shareReport";
import { createReportController } from "./reportController";
import "./OrganizerInsights.css";

export default function OrganizerInsights(props) {
  if (!props.isAdmin) return null;
  return <ReportPanel key={props.league.id} {...props} />;
}

function ReportPanel({ league, loadData, exportReport = shareReport }) {
  const [controller] = useState(() => createReportController({ leagueId: league.id, loadData }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { days, data } = state;
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void controller.load();
    return () => controller.dispose();
  }, [controller]);
  const report = useMemo(() => data ? buildOrganizerReport({
    leagueId: league.id, players: data.players, matches: data.matches, days: data.days, now: data.asOf,
  }) : null, [league.id, data]);

  function reload(period = days) {
    if (inFlight.current) return;
    setMessage(""); setError("");
    void controller.load(period);
  }

  async function download(kind) {
    const current = controller.getSnapshot();
    if (inFlight.current || current.status !== "ready" || current.data !== data || !report) return;
    inFlight.current = true;
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await exportReport(reportFilename(league.name, kind, days, new Date(data.asOf)), createReportCsv(report, kind));
      if (result?.downloaded === true) setMessage("Report download started.");
      else if (result?.shared === true) setMessage("Report shared.");
      else if (result?.shared === false) setMessage("Sharing cancelled.");
      else throw new Error("Could not confirm the export. Please try again.");
    } catch (failure) {
      setError(failure?.message || "Could not export the report. Try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <section className="card organizer-insights" aria-labelledby="organizer-insights-title">
      <div className="organizer-insights-heading">
        <div>
          <p className="season-label">ORGANIZER TOOLS · FREE PREVIEW</p>
          <h3 id="organizer-insights-title">League insights & reports</h3>
          <p>Read-only statistics for this league. Your current access stays unchanged.</p>
        </div>
        <label>
          Report period
          <select aria-label="Report period" value={days ?? "all"} disabled={busy}
            onChange={(event) => reload(event.target.value === "all" ? null : Number(event.target.value))}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </label>
      </div>
      <div className="organizer-report-controls">
        {state.status === "loading" ? (
          <>
            <p role="status">Loading complete report… {state.progress && `${state.progress.players} players · ${state.progress.matches} matches loaded`}</p>
            <button type="button" className="secondary-button" onClick={controller.cancel}>Cancel loading</button>
          </>
        ) : <button type="button" className="secondary-button" disabled={busy} onClick={() => reload()}>
          {state.status === "ready" ? "Refresh report" : "Load report"}
        </button>}
      </div>
      {state.status === "error" && <p role="alert" className="error-message">{state.error} No partial report was exported.</p>}
      {state.status === "cancelled" && <p role="status">Report loading cancelled. No report was exported.</p>}
      {report && <>
      <dl className="organizer-metrics">
        <div><dt>Completed matches</dt><dd>{report.completedMatches}</dd></div>
        <div><dt>Active roster</dt><dd>{report.activePlayers}</dd></div>
        <div><dt>Players participating</dt><dd>{report.participatingPlayers}</dd></div>
        <div><dt>Participation rate</dt><dd>{report.participationRate}%</dd></div>
      </dl>
      <p className="form-help">{report.periodLabel}. Loaded {new Date(data.asOf).toLocaleString()}. Participation counts current active players with at least one completed match. Refresh to include recent changes.</p>
      <h4>Most active players</h4>
      {report.completedMatches === 0 ? <p>No completed matches in this period yet.</p> : (
        <ol className="organizer-activity-list">
          {report.playerRows.filter((player) => player.matches > 0).slice(0, 5).map((player) => (
            <li key={player.id}>
              <span>{player.name}{!player.active && <small> · inactive</small>}</span>
              <strong>{player.matches} {player.matches === 1 ? "match" : "matches"} · {player.wins}W / {player.losses}L</strong>
            </li>
          ))}
        </ol>
      )}
      {report.skipped > 0 && <p role="status">{report.skipped} incomplete or invalid records were excluded from this report.</p>}
      </>}
      <div className="organizer-export-actions">
        <button type="button" className="secondary-button" disabled={busy || !report} onClick={() => download("players")}>Export player statistics</button>
        <button type="button" className="secondary-button" disabled={busy || !report} onClick={() => download("matches")}>Export match history</button>
      </div>
      <p className="form-help">CSV reports include player names and match results—not emails, account IDs, or league codes. Only share them with people who should have this information.</p>
      {busy && <p role="status">Preparing report…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
    </section>
  );
}
