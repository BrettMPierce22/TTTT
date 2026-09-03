import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { assertSafePublicAsset, validateReleaseEnvironment } from "./release-safety.mjs";

const ref = "abcdefghijklmnopqrst";
const jwt = (payload) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.fictional_signature`;
const anon = jwt({ role: "anon", ref, exp: 4102444800 });
const environment = (overrides = {}) => ({ VITE_SUPABASE_URL: `https://${ref}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: anon, ...overrides });

describe("release configuration safety", () => {
  it("accepts legacy anonymous and modern publishable public keys", () => {
    expect(() => validateReleaseEnvironment(environment())).not.toThrow();
    expect(() => validateReleaseEnvironment(environment({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictional" }))).not.toThrow();
  });
  it.each(["", "your-supabase-publishable-key", "sb_secret_fictional", jwt({ role: "service_role", ref, exp: 4102444800 }), jwt({ role: "authenticated", ref, exp: 4102444800 }), jwt({ role: "anon", ref: "other-project", exp: 4102444800 }), jwt({ role: "anon", ref, exp: 1 })])("blocks unusable or non-public keys without printing their value", (key) => {
    expect(() => validateReleaseEnvironment(environment({ VITE_SUPABASE_PUBLISHABLE_KEY: key }))).toThrow(/public Supabase key/);
    try { validateReleaseEnvironment(environment({ VITE_SUPABASE_PUBLISHABLE_KEY: key })); } catch (error) { if (key) expect(error.message).not.toContain(key); }
  });
  it.each([undefined, "http://localhost:54321", "https://your-project.supabase.co", `https://${ref}.supabase.co/?key=secret`, `https://user:secret@${ref}.supabase.co`])("rejects invalid production backend URLs", (url) => {
    expect(() => validateReleaseEnvironment(environment({ VITE_SUPABASE_URL: url }))).toThrow(/VITE_SUPABASE_URL/);
  });
  it("prevents enabling the unapplied subscription backend", () => {
    expect(() => validateReleaseEnvironment(environment({ VITE_SUBSCRIPTIONS_BACKEND_ENABLED: "true" }))).toThrow(/disabled/);
    expect(() => validateReleaseEnvironment(environment({ VITE_SUBSCRIPTIONS_BACKEND_ENABLED: "false" }))).not.toThrow();
  });
  it("checks the email destination in the release environment", () => {
    expect(() => validateReleaseEnvironment(environment({ VITE_APP_URL: "capacitor://localhost" }))).toThrow(/VITE_APP_URL/);
  });
});

describe("shipped asset checks", () => {
  it("permits public keys and ordinary SDK role strings", () => {
    expect(() => assertSafePublicAsset("assets/app.js", `${anon}; sb_publishable_fictional; service_role; authenticated`)).not.toThrow();
  });
  it.each(["sb_secret_fictional", "-----BEGIN PRIVATE KEY-----", "-----BEGIN RSA PRIVATE KEY-----", "postgresql://user:secret@db.example.com", jwt({ role: "service_role" }), jwt({ role: "authenticated" })])("rejects potential server credentials without printing them", (secret) => {
    expect(() => assertSafePublicAsset("assets/app.js", secret)).toThrow(/public asset/);
    try { assertSafePublicAsset("assets/app.js", secret); } catch (error) { expect(error.message).not.toContain(secret); }
  });
  it("rejects public source maps", () => {
    expect(() => assertSafePublicAsset("assets/app.js.map", "{}")).toThrow(/source map/);
  });
});
