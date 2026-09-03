// Ephemeral and scoped to one mounted league screen. No localStorage, no stale
// exports while a refresh is in flight, and no automatic background polling.
export function createReportController({ leagueId, loadData, timeoutMs = 30000 }) {
  let state = { days: 30, status: "idle", data: null, progress: null, error: "" };
  let active;
  const listeners = new Set();
  const publish = (patch) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const stop = () => {
    if (!active) return;
    const previous = active;
    active = null;
    clearTimeout(previous.timer);
    previous.abort.abort();
  };
  async function load(days = state.days) {
    if (![30, 90, null].includes(days)) return;
    stop();
    const request = { abort: new AbortController(), timer: null };
    active = request;
    publish({ days, status: "loading", data: null, progress: null, error: "" });
    request.timer = setTimeout(() => {
      if (active !== request) return;
      stop();
      publish({ status: "error", error: "The report took too long to load. Check your connection and retry." });
    }, timeoutMs);
    try {
      const data = await loadData({ leagueId, days, signal: request.abort.signal,
        onProgress: (progress) => { if (active === request) publish({ progress }); },
      });
      if (active !== request) return;
      if (data?.leagueId !== leagueId || data.days !== days || !Array.isArray(data.players) ||
          !Array.isArray(data.matches) || !Number.isFinite(Date.parse(data.asOf))) {
        throw new Error("Could not verify this league report. Please retry.");
      }
      publish({ status: "ready", data, error: "" });
    } catch (error) {
      if (active === request) publish({ status: "error", data: null, error: error?.message || "Could not load the report. Please retry." });
    } finally {
      clearTimeout(request.timer);
      if (active === request) active = null;
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    load,
    cancel() { stop(); publish({ status: "cancelled", data: null, progress: null, error: "" }); },
    dispose() { stop(); publish({ status: "idle", data: null, progress: null, error: "" }); },
  };
}
