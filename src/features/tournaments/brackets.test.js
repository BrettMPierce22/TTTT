import { describe, expect, it } from "vitest";
import { buildTournamentMatches } from "./brackets";
import { canRecordTournamentMatch, validateTournamentScore } from "./matchRules";

const entries = (count) => Array.from({ length: count }, (_, index) => ({ id: `entry-${index}`, seed: index + 1 }));
describe("bracket structures", () => {
  for (const format of ["single_elimination", "double_elimination", "round_robin"]) {
    for (const count of [3, 4, 5, 6, 7, 8, 9, 16, 17, 32, 33, 64, 65, 128]) {
      it(`${format} with ${count} entrants has valid unique paths`, () => {
        const roster = entries(count);
        const original = structuredClone(roster);
        const matches = buildTournamentMatches({ id: "tournament", format, include_third_place: true, grand_final_reset: true }, roster);
        expect(roster).toEqual(original);
        const ids = new Set(matches.map((match) => match.id));
        expect(ids.size).toBe(matches.length);
        for (const match of matches) {
          for (const key of ["winner_next_match_id", "loser_next_match_id"]) if (match[key]) { expect(ids.has(match[key])).toBe(true); expect(match[key]).not.toBe(match.id); }
        }
        if (format === "round_robin") {
          expect(matches).toHaveLength(count * (count - 1) / 2);
          expect(new Set(matches.map((match) => [match.player_a_entry_id, match.player_b_entry_id].sort().join(":"))).size).toBe(matches.length);
        }
        expect(matches.some((match) => canRecordTournamentMatch(match, matches))).toBe(true);
      });
    }
  }
  it("rejects invalid seeds and duplicate entrants", () => {
    expect(() => buildTournamentMatches({ id: "t", format: "single_elimination" }, [{ id: "a", seed: 1 }, { id: "b", seed: 1 }])).toThrow(/Seeds/);
    expect(() => buildTournamentMatches({ id: "t", format: "single_elimination" }, [{ id: "a", seed: 1 }, { id: "a", seed: 2 }])).toThrow(/unique/);
  });
  it("never advances a lone entrant while a feeder match is pending", () => {
    const target = { id: "final", status: "scheduled", player_a_entry_id: "a" };
    const feeder = { id: "semi", status: "scheduled", winner_next_match_id: "final" };
    expect(canRecordTournamentMatch(target, [target, feeder])).toBe(false);
    feeder.status = "complete";
    expect(canRecordTournamentMatch(target, [target, feeder])).toBe(true);
  });
  it.each([1, 3, 5, 7])("requires a completed best-of-%i result", (bestOf) => {
    const needed = (bestOf + 1) / 2;
    expect(validateTournamentScore(bestOf, String(needed), "0")).toEqual([needed, 0]);
    for (const scores of [["", needed], [needed, needed], [needed + 1, 0], [needed, -1], [needed, 0.5]]) expect(() => validateTournamentScore(bestOf, ...scores)).toThrow();
  });
});
