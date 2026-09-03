const RECOVERY_KEY = "tttt_password_recovery";
const RECOVERY_WINDOW_MS = 2 * 60 * 60 * 1000;

// Capture only UI hints before the SDK consumes the callback. Never retain,
// render, log or manually exchange credentials found in an email URL here.
export function inspectAuthRedirect(href) {
  try {
    const url = new URL(href);
    const params = new URLSearchParams(url.search);
    for (const [key, value] of new URLSearchParams(url.hash.slice(1))) params.set(key, value);
    const failed = ["error", "error_code", "error_description"].some((key) => params.has(key));
    return {
      recovery: !failed && params.get("type") === "recovery" && params.has("access_token"),
      error: failed ? "This email link is invalid or has expired. Request a new link and use the most recent email." : "",
    };
  } catch {
    return { recovery: false, error: "" };
  }
}

export function clearFailedAuthRedirect(location = window.location, history = window.history) {
  const url = new URL(location.href);
  if (!inspectAuthRedirect(url.href).error) return;
  const keys = ["error", "error_code", "error_description", "access_token", "refresh_token", "expires_in", "expires_at", "token_type", "type", "code"];
  const hash = new URLSearchParams(url.hash.slice(1));
  for (const key of keys) { url.searchParams.delete(key); hash.delete(key); }
  if (!url.hash.startsWith("#/")) url.hash = hash.toString() ? `#${hash}` : "";
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

// This marker remembers a screen, NOT authorization. Supabase still validates
// the current session on every updateUser request. It contains no credentials.
export function createRecoveryIntent({ storage, now = Date.now }) {
  let memory = null;
  function read() {
    try { return JSON.parse(storage.getItem(RECOVERY_KEY)) || memory; } catch { return memory; }
  }
  function clear() {
    memory = null;
    try { storage.removeItem(RECOVERY_KEY); } catch { /* Storage may be disabled. */ }
  }
  function begin(userId) {
    if (!userId) return;
    const existing = read();
    if (existing?.userId === userId && existing.until > now() && existing.until <= now() + RECOVERY_WINDOW_MS) return;
    memory = { userId, until: now() + RECOVERY_WINDOW_MS };
    try { storage.setItem(RECOVERY_KEY, JSON.stringify(memory)); } catch { /* Keep an in-memory fallback. */ }
  }
  function shouldResume(userId) {
    if (!userId) { clear(); return false; }
    const value = read();
    if (value?.userId === userId && Number.isFinite(value.until) && value.until > now() && value.until <= now() + RECOVERY_WINDOW_MS) return true;
    clear();
    return false;
  }
  return { begin, clear, shouldResume };
}

export function authActionError(error, fallback) {
  if (["over_email_send_rate_limit", "over_request_rate_limit"].includes(error?.code) || error?.status === 429) return "Too many attempts. Please wait a little before trying again.";
  if (["session_not_found", "refresh_token_not_found", "refresh_token_already_used", "otp_expired"].includes(error?.code) || error?.name === "AuthSessionMissingError") return "Your session or email link has expired. Request a new password-reset email and try again.";
  if (error?.code === "email_not_confirmed") return "Confirm your email before signing in. You can resend the confirmation email below.";
  if (error?.code === "same_password") return "Choose a password different from your current password.";
  if (error?.code === "weak_password") return "Choose a stronger password with at least 8 characters.";
  return fallback;
}
