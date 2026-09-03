import { describe, expect, it } from "vitest";
import { DEFAULT_APP_URL, getAuthRedirectUrl } from "./redirectUrl";

describe("email callback destination", () => {
  it("defaults to the real website and normalizes its trailing slash", () => {
    expect(getAuthRedirectUrl()).toBe(DEFAULT_APP_URL);
    expect(getAuthRedirectUrl(" ")).toBe(DEFAULT_APP_URL);
    expect(getAuthRedirectUrl(`${DEFAULT_APP_URL}/`)).toBe(DEFAULT_APP_URL);
  });
  it.each([
    "capacitor://localhost", "http://tabletalktabletennis.com", "javascript:alert(1)",
    "https://localhost", "https://127.0.0.1", "https://[::1]", "https://example.test",
    "https://user:secret@tabletalktabletennis.com", "https://tabletalktabletennis.com:8443",
    "https://tabletalktabletennis.com/reset", "https://tabletalktabletennis.com/?code=secret",
    "https://tabletalktabletennis.com/#/legal/privacy", "not a url",
  ])("rejects unsupported callback configuration without echoing it: %s", (value) => {
    expect(() => getAuthRedirectUrl(value)).toThrow(/VITE_APP_URL/);
    try { getAuthRedirectUrl(value); } catch (error) { expect(error.message).not.toContain(value); }
  });
});
