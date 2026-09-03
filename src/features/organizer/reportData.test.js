import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { fetchOrganizerReportData } from "./reportData";

const leagueId = "10000000-0000-4000-8000-000000000001";
const otherLeague = "10000000-0000-4000-8000-000000000002";
const id = (number) => `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const now = new Date("2026-09-03T12:00:00Z");
const row = (number, patch = {}) => ({ id: id(number), league_id: leagueId, created_at: "2026-09-01T12:00:00Z", ...patch });

function fixture({ players = [row(1, { name: "Alex", is_active: true })], matches = [], cap = 250, override } = {}) {
  const requests = [];
  const fetch = vi.fn(async (input) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    requests.push({ table, params: url.searchParams });
    const params = url.searchParams;
    const cursor = params.get("id")?.slice(3);
    const range = params.getAll("created_at");
    const rows = (table === "players" ? players : matches).filter((item) =>
      item.league_id === params.get("league_id").slice(3) &&
      (!cursor || item.id > cursor) && range.every((value) =>
        value.startsWith("lte.") ? item.created_at <= value.slice(4) : item.created_at >= value.slice(4)
      )
    ).sort((a, b) => a.id.localeCompare(b.id));
    const data = rows.slice(0, Math.min(Number(params.get("limit")), cap));
    const changed = override?.({ table, data, count: rows.length, requests });
    return changed || new Response(JSON.stringify(data), { headers: {
      "Content-Type": "application/json", "Content-Range": `0-${Math.max(0, data.length - 1)}/${rows.length}`,
    } });
  });
  const client = createClient("https://reports.example.invalid", "test-only-key", {
    global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const run = (options = {}) => fetchOrganizerReportData(client, { leagueId, days: null, now, ...options });
  return { run, fetch, requests };
}

describe("complete organizer report reads", () => {
  it("loads every record beyond 1,000 rows using real client query construction", async () => {
    const { run, requests } = fixture({ matches: Array.from({ length: 1205 }, (_, i) => row(i + 1)) });
    const progress = vi.fn();
    const result = await run({ onProgress: progress });
    expect(result.matches).toHaveLength(1205);
    expect(new Set(result.matches.map((item) => item.id)).size).toBe(1205);
    expect(requests).toHaveLength(6);
    expect(progress).toHaveBeenLastCalledWith({ players: 1, matches: 1205 });
    for (const { params } of requests) {
      expect(params.get("league_id")).toBe("eq." + leagueId);
      expect(params.get("order")).toBe("id.asc");
      expect(params.get("limit")).toBe("250");
      expect(params.get("select")).not.toMatch(/user_id|email|created_by|join_code|\*/);
    }
  });
  it("continues when the server's page cap is smaller than requested", async () => {
    const { run } = fixture({ matches: Array.from({ length: 17 }, (_, i) => row(i + 1)), cap: 3 });
    expect((await run()).matches).toHaveLength(17);
  });
  it("filters the date range, future rows, other leagues and unrequested fields", async () => {
    const { run } = fixture({ players: [row(1, { email: "secret", user_id: "secret" })], matches: [
      row(1), row(2, { created_at: "2026-06-01T12:00:00Z" }), row(3, { league_id: otherLeague }),
      row(4, { created_at: "2027-01-01T12:00:00Z" }),
    ] });
    const data = await run({ days: 30 });
    expect(data.matches.map((item) => item.id)).toEqual([id(1)]);
    expect(data.players[0]).not.toHaveProperty("email");
    expect(data.players[0]).not.toHaveProperty("user_id");
    expect(data).toMatchObject({ leagueId, days: 30, asOf: now.toISOString() });
  });
  it("returns an empty but fully verified report", async () => {
    const { run } = fixture({ players: [], matches: [] });
    expect(await run()).toMatchObject({ players: [], matches: [] });
  });
  it.each([
    ["unknown total", ({ data }) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })],
    ["missing page", () => new Response("[]", { headers: { "Content-Range": "*/3" } })],
    ["oversized archive", () => new Response("[]", { headers: { "Content-Range": "*/50001" } })],
    ["access failure", () => new Response("Access denied", { status: 403 })],
    ["another league", () => new Response(JSON.stringify([row(1, { league_id: otherLeague })]), { headers: { "Content-Range": "0-0/1" } })],
    ["duplicate IDs", () => new Response(JSON.stringify([row(1), row(1)]), { headers: { "Content-Range": "0-1/2" } })],
  ])("fails closed on %s", async (_, override) => {
    await expect(fixture({ override }).run()).rejects.toThrow();
  });
  it("rejects a changing remaining count rather than returning a partial archive", async () => {
    const { run } = fixture({ matches: Array.from({ length: 260 }, (_, i) => row(i + 1)), override: ({ table, data, requests }) =>
      table === "matches" && requests.length > 2
        ? new Response(JSON.stringify(data), { headers: { "Content-Range": "0-9/11" } }) : null,
    });
    await expect(run()).rejects.toThrow(/changed/);
  });
  it("does not start requests after cancellation or with invalid input", async () => {
    const { run, fetch } = fixture();
    const abort = new AbortController(); abort.abort();
    await expect(run({ signal: abort.signal })).rejects.toThrow();
    await expect(run({ leagueId: "bad" })).rejects.toThrow();
    await expect(run({ days: 2 })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("stops fetching more pages when the panel is cancelled mid-report", async () => {
    const { run, requests } = fixture({ matches: Array.from({ length: 600 }, (_, i) => row(i + 1)) });
    const abort = new AbortController();
    await expect(run({ signal: abort.signal, onProgress: ({ matches }) => { if (matches === 250) abort.abort(); } })).rejects.toThrow();
    expect(requests).toHaveLength(2);
  });
});
