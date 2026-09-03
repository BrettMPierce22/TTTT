import { beforeEach, describe, expect, it } from "vitest";
import { authActionError, clearFailedAuthRedirect, createRecoveryIntent, inspectAuthRedirect } from "./emailRecovery";

beforeEach(() => { window.sessionStorage.clear(); window.history.replaceState({}, "", "/"); });
describe("email recovery helpers", () => {
  it("never returns tokens or untrusted error descriptions", () => {
    const result = inspectAuthRedirect("https://example.test/#error_code=otp_expired&error_description=SECRET&access_token=TOKEN&refresh_token=REFRESH&type=recovery");
    expect(result.recovery).toBe(false);
    expect(result.error).toContain("expired");
    expect(JSON.stringify(result)).not.toMatch(/SECRET|TOKEN|REFRESH/);
  });
  it("leaves valid credential URLs for the SDK to consume", () => {
    window.history.replaceState({}, "", "/#access_token=fictional&type=recovery");
    clearFailedAuthRedirect();
    expect(window.location.hash).toContain("access_token=fictional");
  });
  it("cleans failed callback credentials while preserving unrelated routing parameters", () => {
    window.history.replaceState({}, "", "/?view=help&error_code=otp_expired#access_token=fictional&refresh_token=fictional&type=recovery");
    clearFailedAuthRedirect();
    expect(window.location.search).toBe("?view=help");
    expect(window.location.hash).toBe("");
  });
  it("does not mistake policy routes or invalid URLs for recovery", () => {
    expect(inspectAuthRedirect("https://example.test/#/legal/privacy")).toEqual({ recovery: false, error: "" });
    expect(inspectAuthRedirect("bad url")).toEqual({ recovery: false, error: "" });
  });
  it("remembers only the reset screen for the same account across reloads", () => {
    const intent = createRecoveryIntent({ storage: window.sessionStorage });
    intent.begin("account-a");
    expect(createRecoveryIntent({ storage: window.sessionStorage }).shouldResume("account-a")).toBe(true);
    expect(intent.shouldResume("account-b")).toBe(false);
    expect(intent.shouldResume("account-a")).toBe(false);
  });
  it("expires the UI marker without extending its life on refresh", () => {
    let time = 100;
    const intent = createRecoveryIntent({ storage: window.sessionStorage, now: () => time });
    intent.begin("account-a");
    time += 60 * 60 * 1000;
    intent.begin("account-a");
    time += 60 * 60 * 1000;
    expect(intent.shouldResume("account-a")).toBe(false);
  });
  it("clears recovery on completion or sign-out", () => {
    const intent = createRecoveryIntent({ storage: window.sessionStorage });
    intent.begin("account-a"); intent.clear();
    expect(intent.shouldResume("account-a")).toBe(false);
    intent.begin("account-a");
    expect(intent.shouldResume(null)).toBe(false);
  });
  it("still works in memory when browser storage is unavailable", () => {
    const denied = () => { throw new Error("Blocked"); };
    const intent = createRecoveryIntent({ storage: { getItem: denied, setItem: denied, removeItem: denied } });
    intent.begin("account-a");
    expect(intent.shouldResume("account-a")).toBe(true);
    intent.clear();
    expect(intent.shouldResume("account-a")).toBe(false);
  });
  it("uses helpful safe messages for common auth errors", () => {
    expect(authActionError({ code: "email_not_confirmed" }, "Fallback")).toContain("Confirm your email");
    expect(authActionError({ status: 429 }, "Fallback")).toContain("wait");
    expect(authActionError({ name: "AuthSessionMissingError" }, "Fallback")).toContain("expired");
    expect(authActionError({ message: "secret server detail" }, "Fallback")).toBe("Fallback");
  });
});
