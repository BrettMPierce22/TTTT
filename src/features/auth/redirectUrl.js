export const DEFAULT_APP_URL = "https://tabletalktabletennis.com";

// Email links currently finish on the website, not the Capacitor origin.
// Keep the root URL aligned with the exact production redirect allowlist.
export function getAuthRedirectUrl(configured) {
  const value = configured?.trim() || DEFAULT_APP_URL;
  let url;
  try { url = new URL(value); } catch { throw new Error("VITE_APP_URL must be a public HTTPS root URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || url.pathname !== "/" || url.search || url.hash
    || !url.hostname.includes(".") || /(^|\.)(localhost|local|test|invalid)$/.test(url.hostname)
    || /^\d+(\.\d+){3}$/.test(url.hostname) || url.hostname.startsWith("[")) {
    throw new Error("VITE_APP_URL must be a public HTTPS root URL without credentials, query or fragment.");
  }
  return url.origin;
}
