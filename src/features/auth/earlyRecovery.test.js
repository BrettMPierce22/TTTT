import { beforeEach, expect, it, vi } from "vitest";
import { createRecoveryIntent } from "./emailRecovery";

const sdk = vi.hoisted(() => ({ listener: null }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: {
  onAuthStateChange: (callback) => { sdk.listener = callback; },
} }) }));
beforeEach(() => { vi.resetModules(); window.sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

it("records a validated recovery notification before React mounts", async () => {
  await import("../../lib/supabaseClient");
  sdk.listener("PASSWORD_RECOVERY", { user: { id: "fictional-user" } });
  expect(createRecoveryIntent({ storage: window.sessionStorage }).shouldResume("fictional-user")).toBe(true);
});

it("does not trust a recovery URL alone or a normal sign-in", async () => {
  window.history.replaceState({}, "", "/#access_token=fictional&type=recovery");
  await import("../../lib/supabaseClient");
  sdk.listener("SIGNED_IN", { user: { id: "fictional-user" } });
  expect(createRecoveryIntent({ storage: window.sessionStorage }).shouldResume("fictional-user")).toBe(false);
});

it("clears the marker on SDK sign-out before a later mount", async () => {
  await import("../../lib/supabaseClient");
  sdk.listener("PASSWORD_RECOVERY", { user: { id: "fictional-user" } });
  sdk.listener("SIGNED_OUT", null);
  expect(createRecoveryIntent({ storage: window.sessionStorage }).shouldResume("fictional-user")).toBe(false);
});
