import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSessionStartup } from "./sessionStartup";

const session = (id = "account-a") => ({ user: { id } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup({ restore = Promise.resolve({ data: { session: session() } }), bootstrap = vi.fn().mockResolvedValue() } = {}) {
  let notify;
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(() => restore),
    onAuthStateChange: vi.fn((callback) => { notify = callback; return { data: { subscription: { unsubscribe } } }; }),
  };
  const callbacks = { bootstrap, onSession: vi.fn(), onClear: vi.fn(), onRecovery: vi.fn(), onStatus: vi.fn() };
  const controller = startSessionStartup({ auth, ...callbacks, timeoutMs: 1000 });
  return { auth, ...callbacks, controller, unsubscribe, emit: (event, value) => notify(event, value) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("session startup coordination", () => {
  it("waits for saved session and account loading before showing ready", async () => {
    const restored = deferred(), loaded = deferred();
    const app = setup({ restore: restored.promise, bootstrap: vi.fn(() => loaded.promise) });
    expect(app.onStatus).toHaveBeenLastCalledWith("restoring");
    restored.resolve({ data: { session: session() } });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.bootstrap).toHaveBeenCalledTimes(1);
    expect(app.onStatus).not.toHaveBeenCalledWith("ready");
    loaded.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
    app.controller.dispose();
  });

  it("does not turn an initialization error plus null INITIAL_SESSION into a login screen", async () => {
    const restored = deferred();
    const app = setup({ restore: restored.promise });
    app.emit("INITIAL_SESSION", null);
    restored.resolve({ data: { session: null }, error: new Error("Offline") });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onStatus).toHaveBeenLastCalledWith("error");
    expect(app.onSession).not.toHaveBeenCalled();
    expect(app.bootstrap).not.toHaveBeenCalled();
  });

  it("shows login for a successfully restored empty session", async () => {
    const app = setup({ restore: Promise.resolve({ data: { session: null } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onSession).toHaveBeenLastCalledWith(null);
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
    expect(app.bootstrap).not.toHaveBeenCalled();
  });

  it("coalesces getSession, INITIAL_SESSION, SIGNED_IN, and token refresh", async () => {
    const restored = deferred(), loaded = deferred();
    const app = setup({ restore: restored.promise, bootstrap: vi.fn(() => loaded.promise) });
    app.emit("INITIAL_SESSION", session());
    app.emit("SIGNED_IN", session());
    // No Supabase calls execute synchronously inside the auth callback.
    expect(app.bootstrap).not.toHaveBeenCalled();
    restored.resolve({ data: { session: session() } });
    await vi.advanceTimersByTimeAsync(0);
    app.emit("TOKEN_REFRESHED", session());
    loaded.resolve();
    await vi.advanceTimersByTimeAsync(0);
    app.emit("SIGNED_IN", session());
    app.controller.acceptSession(session()); // explicit login result fallback
    expect(app.bootstrap).toHaveBeenCalledTimes(1);
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it("ignores a stale empty restore after a newer sign-in", async () => {
    const restored = deferred();
    const app = setup({ restore: restored.promise });
    app.emit("SIGNED_IN", session());
    restored.resolve({ data: { session: null } });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onSession).toHaveBeenLastCalledWith(session());
    expect(app.bootstrap).toHaveBeenCalledTimes(1);
  });

  it("invalidates loaded data and delayed work on sign-out", async () => {
    const loaded = deferred();
    const app = setup({ bootstrap: vi.fn(() => loaded.promise) });
    await vi.advanceTimersByTimeAsync(0);
    const isCurrent = app.bootstrap.mock.calls[0][1];
    app.emit("SIGNED_OUT", null);
    expect(isCurrent()).toBe(false);
    expect(app.onClear).toHaveBeenCalledTimes(1);
    loaded.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onSession).toHaveBeenLastCalledWith(null);
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it("does not run queued bootstrap after sign-out", async () => {
    const app = setup({ restore: new Promise(() => {}) });
    app.emit("SIGNED_IN", session());
    app.emit("SIGNED_OUT", null);
    await vi.advanceTimersByTimeAsync(0);
    expect(app.bootstrap).not.toHaveBeenCalled();
  });

  it("clears the old account and ignores its results when the identity changes", async () => {
    const loaded = deferred();
    const bootstrap = vi.fn().mockImplementationOnce(() => loaded.promise).mockResolvedValue();
    const app = setup({ bootstrap });
    await vi.advanceTimersByTimeAsync(0);
    const firstCurrent = bootstrap.mock.calls[0][1];
    app.emit("SIGNED_IN", session("account-b"));
    expect(firstCurrent()).toBe(false);
    expect(app.onClear).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    loaded.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onSession).toHaveBeenLastCalledWith(session("account-b"));
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it.each(["session", "bootstrap"])("times out a hanging %s and retries without restarting", async (stage) => {
    const pending = deferred();
    const app = setup(stage === "session" ? { restore: pending.promise } : { bootstrap: vi.fn(() => pending.promise) });
    await vi.advanceTimersByTimeAsync(1001);
    expect(app.onStatus).toHaveBeenLastCalledWith("error");
    app.auth.getSession.mockResolvedValue({ data: { session: session() } });
    app.bootstrap.mockResolvedValue();
    await app.controller.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
    pending.resolve({ data: { session: null } });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onSession).toHaveBeenLastCalledWith(session());
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it("surfaces account/league failures instead of claiming startup succeeded", async () => {
    const app = setup({ bootstrap: vi.fn().mockRejectedValue(new Error("Profile unavailable")) });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onStatus).toHaveBeenLastCalledWith("error");
  });

  it("preserves password recovery against a late session read and duplicate events", async () => {
    const restored = deferred();
    const app = setup({ restore: restored.promise });
    app.emit("PASSWORD_RECOVERY", session());
    restored.resolve({ data: { session: session() } });
    app.emit("INITIAL_SESSION", session());
    await vi.advanceTimersByTimeAsync(0);
    expect(app.onRecovery).toHaveBeenCalledTimes(1);
    expect(app.bootstrap).not.toHaveBeenCalled();
    expect(app.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it("does not bootstrap anonymous accounts", async () => {
    const app = setup({ restore: Promise.resolve({ data: { session: { user: { id: "anon", is_anonymous: true } } } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.bootstrap).not.toHaveBeenCalled();
    expect(app.onSession).toHaveBeenLastCalledWith(null);
  });

  it("unsubscribes and prevents late writes after unmount/Strict Mode cleanup", async () => {
    const restored = deferred();
    const app = setup({ restore: restored.promise });
    app.controller.dispose();
    restored.resolve({ data: { session: session() } });
    app.emit("SIGNED_IN", session());
    await vi.advanceTimersByTimeAsync(1001);
    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(app.onSession).not.toHaveBeenCalled();
    expect(app.bootstrap).not.toHaveBeenCalled();
  });
});
