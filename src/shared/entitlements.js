import { getSession, onAuthStateChange } from "./auth.js";

const CACHE_TTL_MS = 90_000;
let cacheEntry = null;

function invalidateCache() {
  cacheEntry = null;
}

onAuthStateChange(() => {
  invalidateCache();
});

export async function fetchMyEntitlements() {
  const now = Date.now();
  if (cacheEntry && now - cacheEntry.timestamp < CACHE_TTL_MS) {
    return cacheEntry.value;
  }

  const session = await getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("No authenticated session available for entitlements request.");
  }

  const response = await fetch("/api/me/entitlements", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Entitlements request failed with status ${response.status}`);
  }

  const payload = await response.json();
  cacheEntry = {
    timestamp: now,
    value: payload,
  };

  return payload;
}
