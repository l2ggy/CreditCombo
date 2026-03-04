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

export function tokenizeSearchText(searchText) {
  const normalized = normalizeSearchText(searchText);
  return normalized ? normalized.split(" ") : [];
}

function tokenMatchScore(searchToken, queryToken) {
  if (searchToken === queryToken) return 3;
  if (searchToken.startsWith(queryToken)) return 2;
  if (searchToken.includes(queryToken)) return 1;
  return 0;
}

export function scoreSearchMatch(searchText, queryTokens) {
  if (!queryTokens.length) return 0;

  const searchTokens = tokenizeSearchText(searchText);
  if (!searchTokens.length) return -1;

  let score = 0;
  for (const queryToken of queryTokens) {
    let bestTokenScore = 0;

    for (const searchToken of searchTokens) {
      const currentScore = tokenMatchScore(searchToken, queryToken);
      if (currentScore > bestTokenScore) bestTokenScore = currentScore;
      if (bestTokenScore === 3) break;
    }

    if (!bestTokenScore) return -1;
    score += bestTokenScore;
  }

  return score;
}

/**
 * Shared ranking heuristic for autocomplete/filter lists.
 * Returns -1 when a query token is not represented in the indexed text.
 */
export function weightedSearchScore({ fullText, preferredText = "", queryTokens, preferredTextWeight = 3 }) {
  const fullScore = scoreSearchMatch(fullText, queryTokens);
  if (fullScore < 0) return -1;

  const preferredScore = preferredText ? scoreSearchMatch(preferredText, queryTokens) : -1;
  return fullScore + (preferredScore > 0 ? preferredScore * preferredTextWeight : 0);
}
