import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("../../lib/supabaseClient", () => ({ supabase: backend }));
import TournamentCenter from "./TournamentCenter";
let matchResponse, entryResponse, list;
const props = { league: { id: "league", name: "Fictional League" }, currentPlayer: { id: "p-a" }, players: [], isAdmin: true };
const match = { id: "match", tournament_id: "t", status: "scheduled", bracket: "winners", round_number: 1, match_number: 1, label: "Final", player_a_entry_id: "a", player_b_entry_id: "b" };
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  list = [{ id: "t", name: "Live Event", format: "single_elimination", best_of: 5, status: "active" }, { id: "past", name: "Past Event", format: "single_elimination", best_of: 5, status: "complete" }];
  matchResponse = { data: [match], count: 1 };
  entryResponse = { data: [{ id: "a", player_id: "p-a", guest_name: "Player A", seed: 1 }, { id: "b", guest_name: "Player B", seed: 2 }] };
  backend.from.mockImplementation((table) => {
    const query = { select: () => query, eq: () => query, order: () => query, range: () => Promise.resolve(matchResponse), then: (yes, no) => Promise.resolve(table === "tournaments" ? { data: list } : entryResponse).then(yes, no) };
    return query;
  });
  backend.rpc.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function open() {
  render(<TournamentCenter {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: /Live Event/ }));
  await screen.findByRole("tab", { name: "Bracket" });
}

it("keeps brackets closed until selection and separates current from past events", async () => {
  render(<TournamentCenter {...props} />);
  await screen.findByRole("button", { name: /Live Event/ });
  expect(screen.getByText("Current Tournaments")).toBeInTheDocument();
  expect(screen.getByText("Past Tournaments")).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Bracket" })).not.toBeInTheDocument();
  expect(backend.from).not.toHaveBeenCalledWith("tournament_matches");
});

it("does not reopen a tournament when its late details arrive after going back", async () => {
  const pending = deferred(); matchResponse = pending.promise;
  await open();
  await waitFor(() => expect(backend.from).toHaveBeenCalledWith("tournament_matches"));
  fireEvent.click(screen.getByRole("button", { name: /All Tournaments/ }));
  await act(async () => pending.resolve({ data: [match], count: 1 }));
  expect(await screen.findByRole("button", { name: /Live Event/ })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Bracket" })).not.toBeInTheDocument();
});

it("validates scores in the modal and submits only once", async () => {
  const pending = deferred(); backend.rpc.mockReturnValue(pending.promise);
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Bracket" }));
  fireEvent.click(await screen.findByRole("button", { name: "Record score" }));
  const inputs = screen.getAllByRole("spinbutton");
  fireEvent.change(inputs[0], { target: { value: "4" } });
  fireEvent.change(inputs[1], { target: { value: "0" } });
  fireEvent.submit(inputs[0].closest("form"));
  expect(screen.getByRole("alert")).toHaveTextContent("exactly 3");
  expect(backend.rpc).not.toHaveBeenCalled();
  fireEvent.change(inputs[0], { target: { value: "3" } });
  fireEvent.submit(inputs[0].closest("form")); fireEvent.submit(inputs[0].closest("form"));
  expect(backend.rpc).toHaveBeenCalledTimes(1);
  expect(backend.rpc).toHaveBeenCalledWith("record_tournament_match", { p_match_id: "match", p_score_a: 3, p_score_b: 0, p_game_scores: [] });
  await act(async () => pending.resolve({ error: null }));
  expect(screen.queryByRole("button", { name: "Save Result" })).not.toBeInTheDocument();
});

it("offers a refresh after a failed load without rendering old score controls", async () => {
  matchResponse = { error: new Error("Offline") };
  await open();
  expect(await screen.findByRole("button", { name: "Refresh tournaments" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record score" })).not.toBeInTheDocument();
  matchResponse = { data: [match], count: 1 };
  fireEvent.click(screen.getByRole("button", { name: "Refresh tournaments" }));
  fireEvent.click(screen.getByRole("tab", { name: "Bracket" }));
  expect(await screen.findByRole("button", { name: "Record score" })).toBeInTheDocument();
});
