import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportController } from "./reportController";
const result = (request) => ({ leagueId: request.leagueId, days: request.days, players: [], matches: [], asOf: "2026-09-03T12:00:00Z" });
afterEach(() => vi.useRealTimers());
describe("report request lifecycle", () => {
  it("discards an old period's late response and aborts its request", async () => {
    const pending = [];
    const controller = createReportController({ leagueId: "one", loadData: (request) => new Promise((resolve) => pending.push({ request, resolve })) });
    const first = controller.load(30);
    const second = controller.load(90);
    expect(pending[0].request.signal.aborted).toBe(true);
    pending[1].resolve(result(pending[1].request)); await second;
    pending[0].resolve(result(pending[0].request)); await first;
    expect(controller.getSnapshot()).toMatchObject({ days: 90, status: "ready", data: { days: 90 } });
  });
  it("clears a loaded report before refreshing, and clears data after failure", async () => {
    const loadData = vi.fn().mockImplementation(async (request) => result(request));
    const controller = createReportController({ leagueId: "one", loadData });
    await controller.load();
    expect(controller.getSnapshot().data).toBeTruthy();
    loadData.mockRejectedValue(new Error("Offline"));
    const refresh = controller.load();
    expect(controller.getSnapshot()).toMatchObject({ status: "loading", data: null });
    await refresh;
    expect(controller.getSnapshot()).toMatchObject({ status: "error", data: null, error: "Offline" });
  });
  it("cancels and disposes in-flight work without accepting later results", async () => {
    let request, finish;
    const controller = createReportController({ leagueId: "one", loadData: (value) => { request = value; return new Promise((resolve) => { finish = resolve; }); } });
    const loading = controller.load();
    controller.cancel();
    expect(request.signal.aborted).toBe(true);
    finish(result(request)); await loading;
    expect(controller.getSnapshot()).toMatchObject({ status: "cancelled", data: null });
    controller.dispose();
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", data: null });
  });
  it("ends the loading state on timeout even if the network never resolves", async () => {
    vi.useFakeTimers();
    let request;
    const controller = createReportController({ leagueId: "one", timeoutMs: 100, loadData: (value) => { request = value; return new Promise(() => {}); } });
    void controller.load();
    await vi.advanceTimersByTimeAsync(101);
    expect(request.signal.aborted).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ status: "error", data: null });
  });
  it("rejects results for a different league or period", async () => {
    const controller = createReportController({ leagueId: "one", loadData: async (request) => ({ ...result(request), leagueId: "two" }) });
    await controller.load();
    expect(controller.getSnapshot()).toMatchObject({ status: "error", data: null });
  });
});
