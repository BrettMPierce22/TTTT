import { expect, it, vi } from "vitest";
import { loadTournamentMatches } from "./loadMatches";
it("loads all 8,128 matches even when the server caps each page", async () => {
  const data = Array.from({ length: 8128 }, (_, i) => ({ id: `match-${i}`, tournament_id: "t", round_number: 1, match_number: i }));
  const range = vi.fn(async (start) => ({ data: data.slice(start, start + 100), count: data.length }));
  const query = { select: () => query, eq: () => query, order: () => query, range };
  expect(await loadTournamentMatches({ from: () => query }, "t")).toHaveLength(8128);
  expect(range).toHaveBeenCalledTimes(82);
});
it("fails closed on an incomplete schedule", async () => {
  const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: [], count: 20 }) };
  await expect(loadTournamentMatches({ from: () => query }, "t")).rejects.toThrow(/changed/);
});
it("discards results after navigating away", async () => {
  let current = true;
  const query = { select: () => query, eq: () => query, order: () => query, range: async () => { current = false; return { data: [], count: 0 }; } };
  expect(await loadTournamentMatches({ from: () => query }, "t", () => current)).toEqual([]);
});
