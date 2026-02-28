export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildSearchText(parts) {
  return normalizeSearchText(Array.isArray(parts) ? parts.join(" ") : parts);
}

export function tokenizeSearchQuery(query) {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

export function matchesSearchTokens(searchText, queryTokens) {
  if (!queryTokens.length) return true;
  return queryTokens.every((token) => searchText.includes(token));
}
