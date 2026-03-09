import { getSession, onAuthStateChange } from "./auth.js";

const CACHE_TTL_MS = 90_000;

let cache = null;

function clearCache() {
  cache = null;
}

onAuthStateChange(() => {
  clearCache();
});

export async function fetchMyEntitlements() {
  const session = await getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    return {
      authenticated: false,
      premium: false,
      premiumUntil: null,
      reason: "unauthenticated"
    };
  }

  const now = Date.now();
  if (cache && cache.accessToken === accessToken && now < cache.expiresAt) {
    return cache.payload;
  }

  const response = await fetch("/api/me/entitlements", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json();

  if (!response.ok) {
    return payload;
  }

  cache = {
    accessToken,
    payload,
    expiresAt: now + CACHE_TTL_MS
  };

  return payload;
}
