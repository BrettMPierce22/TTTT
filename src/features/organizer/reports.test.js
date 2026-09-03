import { describe, expect, it } from "vitest";
import { buildOrganizerReport, createReportCsv, csvCell, reportFilename } from "./reports";
const now = new Date("2026-09-02T12:00:00Z");
const players = [
  { id: "a", league_id: "league", name: "Alex", is_active: true, user_id: "private-user-id", email: "private@example.invalid" },
  { id: "b", league_id: "league", name: "Brett", is_active: true },
  { id: "c", league_id: "league", name: "Casey", is_active: true },
  { id: "x", league_id: "other-league", name: "Hidden player", is_active: true },
];
const match = {
  id: "m", league_id: "league", player_a_id: "a", player_b_id: "b",
  created_at: "2026-09-01T12:00:00Z", format: 3, games: [{ a: 11, b: 5 }, { a: 11, b: 8 }],
};
const build = (patch = {}) => buildOrganizerReport({ leagueId: "league", players, matches: [match], now, ...patch });

describe("organizer reports", () => {
  it("calculates matches, participation, and player results in the chosen league", () => {
    const report = build();
    expect(report).toMatchObject({ completedMatches: 1, activePlayers: 3, participatingPlayers: 2, participationRate: 67 });
    expect(report.playerRows.find((player) => player.id === "a")).toMatchObject({ wins: 1, losses: 0, pointsFor: 22, pointsAgainst: 13 });
    expect(report.playerRows.find((player) => player.id === "b")).toMatchObject({ wins: 0, losses: 1 });
    expect(report.playerRows.some((player) => player.name === "Hidden player")).toBe(false);
  });
  it("uses the selected period and excludes future records and other leagues", () => {
    const matches = [
      match,
      { ...match, created_at: "2026-07-01T00:00:00Z" },
      { ...match, created_at: "2027-01-01T00:00:00Z" },
      { ...match, league_id: "other-league" },
    ];
    expect(build({ matches }).completedMatches).toBe(1);
    expect(build({ matches, days: 90 }).completedMatches).toBe(2);
    expect(build({ matches, days: null }).completedMatches).toBe(2);
  });
  it("excludes invalid, tied, incomplete, and overlong results", () => {
    const matches = [
      { ...match, games: [{ a: 11, b: 11 }] },
      { ...match, games: [{ a: 11, b: 2 }] },
      { ...match, games: [{ a: null, b: 2 }] },
      { ...match, games: [...match.games, { a: 11, b: 1 }] },
      { ...match, created_at: "not-a-date" },
      { ...match, player_b_id: "a" },
    ];
    expect(build({ matches })).toMatchObject({ completedMatches: 0, skipped: 6 });
  });
  it("retains history for removed players but excludes them from active participation", () => {
    const report = build({ players: players.map((player) => player.id === "b" ? { ...player, is_active: false } : player) });
    expect(report).toMatchObject({ activePlayers: 2, participatingPlayers: 1, completedMatches: 1 });
    expect(report.playerRows.find((player) => player.id === "b").losses).toBe(1);
    expect(build({ players: [] }).matchRows[0].winner).toBe("Former player");
  });
  it("produces header-only exports for an empty league and rejects invalid options", () => {
    const report = build({ players: [], matches: [] });
    expect(report.participationRate).toBe(0);
    expect(createReportCsv(report, "matches").split("\r\n")).toHaveLength(2);
    expect(() => createReportCsv(report, "secrets")).toThrow();
    expect(() => build({ days: 2 })).toThrow();
    expect(() => build({ now: "bad" })).toThrow();
  });
  it("allowlists exported data and formats game results", () => {
    const report = build();
    const csv = createReportCsv(report, "players");
    expect(csv).toContain('"Alex","Active","1","1","0","100","22","13"');
    expect(csv).not.toContain("private");
    expect(csv).not.toContain("user_id");
    expect(createReportCsv(report, "matches")).toContain("11–5; 11–8");
  });
  it.each(["=HYPERLINK(1)", "+cmd", "-cmd", "@SUM(1)", "  =1", "\t=1", "\r\n@SUM(1)"])("neutralizes spreadsheet formula text %s", (text) => {
    expect(csvCell(text)).toBe('"' + "'" + text + '"');
  });
  it("escapes commas, quotes, newlines, and preserves typed numeric values", () => {
    expect(csvCell('A, "B"\nC')).toBe('"A, ""B""\nC"');
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell(null)).toBe('""');
  });
  it("creates safe filenames without filesystem separators", () => {
    expect(reportFilename("../../Fun League?", "matches", 30, now)).toBe("Fun-League-matches-30d-2026-09-02.csv");
  });
});
