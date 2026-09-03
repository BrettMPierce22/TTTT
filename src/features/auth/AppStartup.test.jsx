import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ auth: {}, redirect: { error: "", recovery: false }, from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock("../../lib/supabaseClient", () => ({ supabase: backend, authRedirect: backend.redirect }));
import App from "../../App";
import { createRecoveryIntent } from "./emailRecovery";

const savedSession = { user: { id: "fictional-user", email: "qa@example.test" } };
let listeners;
let results;
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function emit(event, session) { act(() => { for (const listener of listeners) listener(event, session); }); }

beforeEach(() => {
  vi.clearAllMocks();
  backend.redirect.error = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
  listeners = new Set();
  results = {
    account_profiles: { data: { user_id: savedSession.user.id, display_name: "Fictional Player", theme_preference: "light" } },
    table_locator_moderators: { data: null },
    leagues: { data: { id: "league-one", name: "Fictional Startup League", created_at: "2026-09-01T00:00:00Z" } },
    players: { data: [{ id: "player-one", user_id: savedSession.user.id, name: "Fictional Player", league_id: "league-one", is_active: true, member_role: "member" }] },
    matches: { data: [] },
  };
  backend.auth.getSession = vi.fn().mockResolvedValue({ data: { session: savedSession } });
  backend.auth.onAuthStateChange = (callback) => {
    listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
  };
  backend.from.mockImplementation((table) => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      maybeSingle: () => query, single: () => query,
      then: (yes, no) => Promise.resolve(results[table] || { data: [] }).then(yes, no),
    };
    return query;
  });
  backend.rpc.mockImplementation(async (name) => ({ data: name === "get_my_leagues" ? [{ league_id: "league-one", name: "Fictional Startup League", member_role: "member" }] : [] }));
  const channel = { on: () => channel, subscribe: () => channel };
  backend.channel.mockReturnValue(channel);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("real app startup screens with fictional backend", () => {
  it("restores the remembered league on the first launch without showing login", async () => {
    const profile = deferred();
    results.account_profiles = profile.promise;
    window.localStorage.setItem("tttt_last_league_id", "league-one");
    render(<StrictMode><App /></StrictMode>);
    expect(screen.getByText("Restoring your session…")).toBeInTheDocument();
    await waitFor(() => expect(backend.from).toHaveBeenCalledWith("account_profiles"));
    expect(screen.queryByText("Welcome Back")).not.toBeInTheDocument();
    expect(screen.queryByText("Fictional Startup League")).not.toBeInTheDocument();
    await act(async () => profile.resolve({ data: { user_id: savedSession.user.id, display_name: "Fictional Player" } }));
    expect((await screen.findAllByText("Fictional Startup League")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Restoring your session…")).not.toBeInTheDocument();
    expect(screen.queryByText("Welcome Back")).not.toBeInTheDocument();
    expect(backend.rpc.mock.calls.filter(([name]) => name === "get_my_leagues")).toHaveLength(1);
  });

  it("offers retry for a failed session lookup and then restores the same account", async () => {
    backend.auth.getSession.mockResolvedValueOnce({ error: new Error("Offline"), data: { session: null } });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Let’s reconnect." })).toBeInTheDocument();
    expect(screen.queryByText("Welcome Back")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText("Fictional Startup League")).length).toBeGreaterThan(0);
    expect(backend.auth.getSession).toHaveBeenCalledTimes(2);
  });

  it("does not show the league hub as a success when profile loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    results.account_profiles = { error: new Error("Network failed") };
    render(<App />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Welcome Back")).not.toBeInTheDocument();
    results.account_profiles = { data: { user_id: savedSession.user.id, display_name: "Fictional Player" } };
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText("Fictional Startup League")).length).toBeGreaterThan(0);
  });

  it("does not let optional discovery failures block an existing league", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    backend.rpc.mockImplementation(async (name) => name === "get_my_leagues"
      ? { data: [{ league_id: "league-one", member_role: "member" }] }
      : { error: new Error("Discovery unavailable") });
    render(<App />);
    expect((await screen.findAllByText("Fictional Startup League")).length).toBeGreaterThan(0);
  });

  it("ignores league results arriving after sign-out", async () => {
    const league = deferred();
    results.leagues = league.promise;
    render(<App />);
    await waitFor(() => expect(backend.from).toHaveBeenCalledWith("leagues"));
    emit("SIGNED_OUT", null);
    expect(await screen.findByText("Welcome Back")).toBeInTheDocument();
    await act(async () => league.resolve({ data: { id: "league-one", name: "Late Old League" } }));
    expect(screen.queryByText("Late Old League")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("tttt_last_league_id")).toBeNull();
    expect(screen.getByText("Welcome Back")).toBeInTheDocument();
  });

  it("shows login normally when no session exists", async () => {
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    render(<App />);
    expect(await screen.findByText("Welcome Back")).toBeInTheDocument();
    expect(backend.from).not.toHaveBeenCalledWith("account_profiles");
  });

  it("runs one bootstrap when the login event and password response both arrive", async () => {
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    backend.auth.signInWithPassword = vi.fn(async () => {
      for (const listener of listeners) listener("SIGNED_IN", savedSession);
      return { data: { session: savedSession, user: savedSession.user } };
    });
    render(<App />);
    await screen.findByText("Welcome Back");
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "qa@example.test" } });
    fireEvent.change(screen.getByPlaceholderText("Your password"), { target: { value: "fictional-password" } });
    fireEvent.submit(screen.getByPlaceholderText("Your password").closest("form"));
    expect((await screen.findAllByText("Fictional Startup League")).length).toBeGreaterThan(0);
    expect(backend.rpc.mock.calls.filter(([name]) => name === "get_my_leagues")).toHaveLength(1);
  });

  it("ignores a late profile response after signing out", async () => {
    const profile = deferred();
    results.account_profiles = profile.promise;
    render(<App />);
    await waitFor(() => expect(backend.from).toHaveBeenCalledWith("account_profiles"));
    emit("SIGNED_OUT", null);
    await act(async () => profile.resolve({ data: { display_name: "Old Account Name", theme_preference: "dark" } }));
    expect(screen.getByText("Welcome Back")).toBeInTheDocument();
    expect(window.localStorage.getItem("tttt_theme")).toBe("light");
    expect(backend.rpc).not.toHaveBeenCalledWith("get_my_leagues");
  });

  it("restores the reset form after a reload without opening the league", async () => {
    createRecoveryIntent({ storage: window.sessionStorage }).begin(savedSession.user.id);
    render(<StrictMode><App /></StrictMode>);
    expect(await screen.findByText("Choose a New Password")).toBeInTheDocument();
    expect(backend.rpc).not.toHaveBeenCalledWith("get_my_leagues");
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "new-fictional-password" } });
    emit("TOKEN_REFRESHED", savedSession);
    expect(screen.getByPlaceholderText("At least 8 characters")).toHaveValue("new-fictional-password");
  });

  it("validates passwords, blocks duplicate updates, and confirms completion", async () => {
    const updated = deferred();
    backend.auth.updateUser = vi.fn(() => updated.promise);
    render(<App />);
    emit("PASSWORD_RECOVERY", savedSession);
    await screen.findByText("Choose a New Password");
    const password = screen.getByPlaceholderText("At least 8 characters");
    const confirm = screen.getByPlaceholderText("Enter it again");
    const form = password.closest("form");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.submit(form);
    expect(backend.auth.updateUser).not.toHaveBeenCalled();
    fireEvent.change(password, { target: { value: "new-fictional-password" } });
    fireEvent.change(confirm, { target: { value: "new-fictional-password" } });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(backend.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("New Password")).toBeDisabled();
    expect(screen.getByLabelText("Confirm New Password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Need a new reset email?" })).toBeDisabled();
    await act(async () => updated.resolve({ data: { user: savedSession.user } }));
    expect(screen.getByText("Password updated.")).toBeInTheDocument();
    expect(createRecoveryIntent({ storage: window.sessionStorage }).shouldResume(savedSession.user.id)).toBe(false);
    emit("PASSWORD_RECOVERY", savedSession);
    expect(screen.getByText("Choose a New Password")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "another-new-password" } });
    fireEvent.change(screen.getByPlaceholderText("Enter it again"), { target: { value: "another-new-password" } });
    fireEvent.click(screen.getByText("Update Password"));
    await screen.findByText("Password updated.");
    fireEvent.click(screen.getByText("Continue to Table Talk"));
    expect((await screen.findAllByText("Fictional Startup League")).length).toBeGreaterThan(0);
  });

  it("does not claim success when a reset session has expired", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.auth.updateUser = vi.fn().mockResolvedValue({ error: { name: "AuthSessionMissingError" } });
    render(<App />); emit("PASSWORD_RECOVERY", savedSession);
    await screen.findByText("Choose a New Password");
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "new-fictional-password" } });
    fireEvent.change(screen.getByPlaceholderText("Enter it again"), { target: { value: "new-fictional-password" } });
    fireEvent.click(screen.getByText("Update Password"));
    expect(await screen.findByText(/Your session or email link has expired/)).toBeInTheDocument();
    expect(screen.queryByText("Password updated.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Need a new reset email?"));
    expect(screen.getByText("Forgot Password")).toBeInTheDocument();
  });

  it("offers safe recovery from an expired email link", async () => {
    backend.redirect.error = "This email link is invalid or has expired.";
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    render(<App />);
    expect(screen.getByText("Let’s get you a fresh link.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("New password-reset email"));
    expect(await screen.findByText("Forgot Password")).toBeInTheDocument();
  });

  it("resends confirmation without duplicate requests or account-existence disclosure", async () => {
    const sent = deferred();
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    backend.auth.resend = vi.fn(() => sent.promise);
    render(<App />);
    await screen.findByText("Welcome Back");
    fireEvent.click(screen.getByText("Need a confirmation email?"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "QA@EXAMPLE.TEST" } });
    const form = screen.getByLabelText("Email").closest("form");
    fireEvent.submit(form); fireEvent.submit(form);
    expect(backend.auth.resend).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log In" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeDisabled();
    expect(backend.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "qa@example.test", options: { emailRedirectTo: "https://tabletalktabletennis.com" } });
    await act(async () => sent.resolve({ error: null }));
    expect(screen.getByText(/If that address needs confirmation/)).toBeInTheDocument();
  });

  it("allows retry after rate-limited reset email and prevents duplicate submissions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    backend.auth.resetPasswordForEmail = vi.fn().mockResolvedValueOnce({ error: { status: 429 } }).mockResolvedValue({ error: null });
    render(<App />);
    await screen.findByText("Welcome Back");
    fireEvent.click(screen.getByText("Forgot password?"));
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "qa@example.test" } });
    const form = screen.getByPlaceholderText("you@example.com").closest("form");
    fireEvent.submit(form); fireEvent.submit(form);
    expect(backend.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    fireEvent.submit(form);
    expect(await screen.findByText(/If that address has an account/)).toBeInTheDocument();
    expect(backend.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });

  it("keeps an in-flight reset email on its own screen and announces the result", async () => {
    const sent = deferred();
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    backend.auth.resetPasswordForEmail = vi.fn(() => sent.promise);
    render(<App />);
    await screen.findByText("Welcome Back");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    fireEvent.click(screen.getByText("Forgot password?"));
    expect(screen.getByText(/The reset link opens our website/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "qa@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Email" }));
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByRole("button", { name: "← Back to Log In" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(screen.getByText("Forgot Password")).toBeInTheDocument();
    await act(async () => sent.resolve({ error: null }));
    expect(screen.getByRole("status")).toHaveTextContent(/If that address has an account/);
    expect(screen.getByLabelText("Email")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "← Back to Log In" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("labels signup inputs and preserves the screen until the submission finishes", async () => {
    const signup = deferred();
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    backend.auth.signUp = vi.fn(() => signup.promise);
    render(<App />);
    await screen.findByText("Welcome Back");
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "qa@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fictional-password" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "fictional-password" } });
    fireEvent.submit(screen.getByLabelText("Email").closest("form"));
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Confirm Password")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
    expect(screen.getByRole("heading", { name: "Create Your Account" })).toBeInTheDocument();
    await act(async () => signup.resolve({ data: { session: null }, error: null }));
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Check your inbox/);
  });

  it("announces login failures and restores the controls for retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const login = deferred();
    backend.auth.getSession.mockResolvedValue({ data: { session: null } });
    backend.auth.signInWithPassword = vi.fn(() => login.promise);
    render(<App />);
    await screen.findByText("Welcome Back");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "qa@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fictional-password" } });
    fireEvent.submit(screen.getByLabelText("Password").closest("form"));
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    await act(async () => login.resolve({ error: { code: "invalid_credentials" } }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Could not sign in/);
    expect(screen.getByLabelText("Password")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeEnabled();
  });
});
