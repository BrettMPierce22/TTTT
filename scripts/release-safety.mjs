import { Buffer } from "node:buffer";
import { getAuthRedirectUrl } from "../src/features/auth/redirectUrl.js";

function readJwt(value) {
  try { return JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8")); }
  catch { return null; }
}

export function validateReleaseEnvironment(env) {
  getAuthRedirectUrl(env.VITE_APP_URL);
  let url;
  try { url = new URL(env.VITE_SUPABASE_URL); } catch { /* Generic error below, never echo secrets. */ }
  if (!url || url.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
    || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Release requires a valid hosted VITE_SUPABASE_URL.");
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    const payload = readJwt(key);
    if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)
      || payload?.role !== "anon" || payload?.ref !== url.hostname.split(".")[0]
      || !Number.isFinite(payload?.exp) || payload.exp * 1000 <= Date.now()) {
      throw new Error("Release requires a public Supabase key for this project; privileged, missing, expired or placeholder keys are forbidden.");
    }
  }
  // No billing backend has been approved/deployed. Fail closed even if a CI
  // variable accidentally turns it on; remove this gate only in that release.
  if (env.VITE_SUBSCRIPTIONS_BACKEND_ENABLED && env.VITE_SUBSCRIPTIONS_BACKEND_ENABLED !== "false") {
    throw new Error("Subscription backend must remain disabled for this release.");
  }
}

export function assertSafePublicAsset(name, content) {
  if (name.endsWith(".map")) throw new Error(`Public source map is not approved: ${name}`);
  if (/sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/.test(content)) {
    throw new Error(`Potential server credential in public asset: ${name}`);
  }
  for (const match of content.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    const payload = readJwt(match[0]);
    if (payload && payload.role !== "anon") {
      throw new Error(`Non-public JWT in public asset: ${name}`);
    }
  }
}
