import { describe, expect, it } from "vitest";
import { calculateLeagueAnalytics, getMatchResult, validateMatchScores } from "./scoring";

describe("league match scoring", () => {
  it.each([1, 3, 5])("validates complete best-of-%i matches", (format) => {
    const games = Array.from({ length: (format + 1) / 2 }, () => ({ a: "11", b: "9" }));
    expect(validateMatchScores(format, games)).toEqual(games.map(() => ({ a: 11, b: 9 })));
    expect(getMatchResult({ player_a_id: "a", player_b_id: "b", games }).winnerId).toBe("a");
  });
  it.each([
    [2, [{ a: 11, b: 0 }]], [1, [{ a: " ", b: 3 }]], [1, [{ a: 11, b: 11 }]],
    [1, [{ a: 11, b: -1 }]], [1, [{ a: 11, b: 1.5 }]],
    [3, [{ a: 11, b: 0 }]], [3, [{ a: 11, b: 0 }, { a: 11, b: 0 }, { a: 0, b: 11 }]],
    [1, [{ a: 11, b: 0 }, { a: 11, b: 0 }]],
  ])("rejects invalid or extra games (%j)", (format, games) => { expect(() => validateMatchScores(format, games)).toThrow(); });
  it("updates both players, history and ratings consistently regardless of input order", () => {
    const players = [{ id: "a", name: "A", is_active: true }, { id: "b", name: "B", is_active: true }];
    const matches = [
      { id: "first", player_a_id: "a", player_b_id: "b", format: 1, games: [{ a: 11, b: 7 }], created_at: "2026-09-01T00:00:00Z" },
      { id: "second", player_a_id: "a", player_b_id: "b", format: 1, games: [{ a: 4, b: 11 }], created_at: "2026-09-02T00:00:00Z" },
    ];
    const report = calculateLeagueAnalytics(players, matches);
    expect(calculateLeagueAnalytics(players, [...matches].reverse())).toEqual(report);
    for (const player of report.standings) { expect(player.wins).toBe(1); expect(player.losses).toBe(1); }
    expect(report.standings.reduce((total, player) => total + player.rating, 0)).toBe(2000);
    expect(report.playerHistory.a).toHaveLength(2);
    expect(report.matchAnalytics.first.winnerId).toBe("a");
    expect(report.matchAnalytics.second.winnerId).toBe("b");
  });
});
