export const LEGAL_PAGE_KEYS = new Set([
  "privacy",
  "terms",
  "community",
  "support",
]);

export function getLegalPageFromLocation(location = window.location) {
  const hashPage = location.hash?.replace(/^#\/?(?:legal\/)?/, "") || "";
  if (LEGAL_PAGE_KEYS.has(hashPage)) return hashPage;

  const pathPage = location.pathname?.split("/").filter(Boolean)[0] || "";
  return LEGAL_PAGE_KEYS.has(pathPage) ? pathPage : null;
}

export function getLegalHash(page) {
  return LEGAL_PAGE_KEYS.has(page) ? `#/legal/${page}` : "#/legal/privacy";
}

export function getPublicLegalUrl(page, appUrl = "https://tabletalktabletennis.com") {
  const resolvedPage = LEGAL_PAGE_KEYS.has(page) ? page : "privacy";
  return `${appUrl.replace(/\/$/, "")}/${resolvedPage}/`;
}
